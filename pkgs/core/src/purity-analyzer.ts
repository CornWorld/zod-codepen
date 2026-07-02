/**
 * 基于 AST 的专业纯函数检测器
 *
 * 使用 Babel 解析函数为 AST，进行精确的作用域分析
 */

import { parse } from "@babel/parser";
import _traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// Handle both ESM and CommonJS compatibility
const traverse = (_traverse as any).default || _traverse;

interface PurityAnalysis {
  isPure: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  details: {
    freeVariables: string[];
    sideEffects: string[];
    warnings: string[];
  };
}

interface ScopeInfo {
  bindings: Set<string>; // 在当前作用域声明的变量
  references: Set<string>; // 引用的自由变量
}

class ASTBasedPurityAnalyzer {
  private globalBuiltins = new Set([
    // 标准内置对象
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Symbol",
    "BigInt",
    "Function",
    "Date",
    "RegExp",
    "Error",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Proxy",
    "Reflect",
    // 全局对象
    "Math",
    "JSON",
    "Intl",
    "Atomics",
    "DataView",
    "ArrayBuffer",
    // 全局函数
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURI",
    "encodeURIComponent",
    "decodeURI",
    "decodeURIComponent",
    "eval",
    "isPrototypeOf",
    "propertyIsEnumerable",
    // 值
    "NaN",
    "Infinity",
    "undefined",
    // 构造函数（类型化数组等）
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    // 编译器注入的辅助函数
    "__name",
    "__awaiter",
    "__generator",
    "__extends",
    "__assign",
    "__rest",
    "__decorate",
    "__param",
    "__metadata",
  ]);

  private sideEffectPatterns = [
    "console",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "process",
    "global",
    "globalThis",
  ];

  analyze(fn: (...args: any[]) => any): PurityAnalysis {
    const code = fn.toString();

    try {
      // 解析为 AST
      const ast = this.parseFunction(code);

      // 分析作用域和引用
      const scopeInfo = this.analyzeScope(ast);

      // 检测副作用
      const sideEffects = this.detectSideEffects(ast);

      // 判断纯度
      return this.determinePurity(scopeInfo, sideEffects);
    } catch (error) {
      // 解析失败，保守处理
      return {
        isPure: false,
        confidence: "low",
        reason: `Parse error: ${error instanceof Error ? error.message : "Unknown"}`,
        details: {
          freeVariables: [],
          sideEffects: [],
          warnings: ["Failed to parse function"],
        },
      };
    }
  }

  private parseFunction(code: string): t.File {
    // 处理不同格式的函数
    let wrappedCode = code;

    // 如果是裸箭头函数或函数声明，包装成表达式
    if (!code.trim().startsWith("(")) {
      wrappedCode = `(${code})`;
    }

    return parse(wrappedCode, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  }

  private analyzeScope(ast: t.File): ScopeInfo {
    const scopeInfo: ScopeInfo = {
      bindings: new Set(),
      references: new Set(),
    };

    let functionScope: NodePath | null = null;

    traverse(ast, {
      // 找到主函数节点
      Function: {
        enter: (path: any) => {
          if (!functionScope) {
            // 这是主函数
            functionScope = path;

            // 收集参数
            path.node.params.forEach((param: any) => {
              this.collectBindings(param, scopeInfo.bindings);
            });
          } else if (functionScope) {
            // 嵌套函数，收集其参数作为局部绑定
            path.node.params.forEach((param: any) => {
              this.collectBindings(param, scopeInfo.bindings);
            });

            // 如果是命名函数，收集函数名
            if (
              (t.isFunctionDeclaration(path.node) ||
                t.isFunctionExpression(path.node)) &&
              path.node.id
            ) {
              scopeInfo.bindings.add(path.node.id.name);
            }
          }
        },
      },

      // 收集变量声明
      VariableDeclarator: (path: any) => {
        if (functionScope && this.isInsideFunction(path, functionScope)) {
          this.collectBindings(path.node.id, scopeInfo.bindings);
        }
      },

      // 收集类声明
      ClassDeclaration: (path: any) => {
        if (functionScope && this.isInsideFunction(path, functionScope)) {
          if (path.node.id) {
            scopeInfo.bindings.add(path.node.id.name);
          }
        }
      },

      // 收集标识符引用
      Identifier: (path: any) => {
        if (!functionScope || !this.isInsideFunction(path, functionScope)) {
          return;
        }

        const name = path.node.name;

        // 跳过：
        // 1. 声明位置的标识符（如 const x = 1 中的 x）
        // 2. 属性名（如 obj.prop 中的 prop，或 { key: value } 中的 key）
        // 3. 解构键名（如 { user: { name } } 中的 user）
        // 4. 类型注解
        if (
          path.isBindingIdentifier() ||
          this.isPropertyName(path) ||
          this.isDestructuringKey(path) ||
          this.isTypeAnnotation(path)
        ) {
          return;
        }

        // 如果不是绑定变量，也不是全局内置，则是自由变量
        if (!scopeInfo.bindings.has(name) && !this.globalBuiltins.has(name)) {
          scopeInfo.references.add(name);
        }
      },
    });

    return scopeInfo;
  }

  private detectSideEffects(ast: t.File): string[] {
    const effectSet = new Set<string>();

    traverse(ast, {
      // 检测赋值操作（可能的副作用）
      // Note: We only flag member expression assignments as potential side effects
      // Local object mutations (const obj = {}; obj.a = 1) are acceptable in transforms
      // but we can't easily distinguish them without full data flow analysis
      AssignmentExpression: (_path: any) => {
        const left = _path.node.left;
        if (t.isMemberExpression(left)) {
          // Check if the object being mutated is an external reference
          // For now, we're permissive - only flag if it's clearly an external object
          const obj = left.object;
          if (t.isIdentifier(obj)) {
            const objName = obj.name;
            // Only flag if assigning to known side-effect globals
            if (this.sideEffectPatterns.includes(objName)) {
              effectSet.add(`Mutates ${objName} (side effect)`);
            }
          }
        }
      },

      // 检测 this 使用（在箭头函数外可能是副作用）
      ThisExpression: (_path: any) => {
        effectSet.add('Uses "this" keyword');
      },

      // 检测已知的副作用全局对象
      MemberExpression: (path: any) => {
        if (t.isIdentifier(path.node.object)) {
          const objName = path.node.object.name;
          if (this.sideEffectPatterns.includes(objName)) {
            effectSet.add(`Accesses ${objName} (side effect)`);
          }
        }
      },

      // 检测 new 表达式（某些构造函数有副作用）
      NewExpression: (path: any) => {
        if (t.isIdentifier(path.node.callee)) {
          const name = path.node.callee.name;
          // Only flag constructors with obvious side effects
          // Date is commonly used in pure transforms for formatting
          if (["Promise", "XMLHttpRequest", "WebSocket"].includes(name)) {
            effectSet.add(`Creates ${name} instance`);
          }
        }
      },

      // 检测 throw（虽然不是副作用，但影响控制流）
      ThrowStatement: (_path: any) => {
        effectSet.add("Throws exceptions");
      },
    });

    return Array.from(effectSet);
  }

  private determinePurity(
    scopeInfo: ScopeInfo,
    sideEffects: string[],
  ): PurityAnalysis {
    const freeVars = Array.from(scopeInfo.references);

    // 1. 有明显副作用
    if (sideEffects.length > 0) {
      return {
        isPure: false,
        confidence: "high",
        reason: `Contains side effects: ${sideEffects[0]}`,
        details: {
          freeVariables: freeVars,
          sideEffects,
          warnings: [],
        },
      };
    }

    // 2. 有自由变量引用
    if (freeVars.length > 0) {
      return {
        isPure: false,
        confidence: freeVars.length === 1 ? "medium" : "high",
        reason: `References external variable(s): ${freeVars.join(", ")}`,
        details: {
          freeVariables: freeVars,
          sideEffects: [],
          warnings: [],
        },
      };
    }

    // 3. 纯函数
    return {
      isPure: true,
      confidence: "high",
      reason: "No external references or side effects detected",
      details: {
        freeVariables: [],
        sideEffects: [],
        warnings: [],
      },
    };
  }

  // ===== 辅助方法 =====

  private collectBindings(node: t.LVal | t.PatternLike, bindings: Set<string>) {
    if (t.isIdentifier(node)) {
      bindings.add(node.name);
    } else if (t.isObjectPattern(node)) {
      node.properties.forEach((prop) => {
        if (t.isObjectProperty(prop)) {
          // Recursively handle nested patterns like { a: { b } }
          this.collectBindings(prop.value as t.LVal, bindings);
        } else if (t.isRestElement(prop)) {
          this.collectBindings(prop.argument, bindings);
        }
      });
    } else if (t.isArrayPattern(node)) {
      node.elements.forEach((elem) => {
        if (elem && !t.isVoidPattern(elem)) {
          this.collectBindings(elem, bindings);
        }
      });
    } else if (t.isAssignmentPattern(node)) {
      this.collectBindings(node.left, bindings);
    } else if (t.isRestElement(node)) {
      this.collectBindings(node.argument, bindings);
    }
    // Skip VoidPattern and other unsupported patterns
  }

  private isInsideFunction(path: NodePath, functionScope: NodePath): boolean {
    let current = path.parentPath;
    while (current) {
      if (current === functionScope) return true;
      current = current.parentPath;
    }
    return false;
  }

  private isPropertyName(path: NodePath<t.Identifier>): boolean {
    const parent = path.parent;
    // Check if this identifier is a property key in MemberExpression (obj.prop)
    if (
      t.isMemberExpression(parent) &&
      parent.property === path.node &&
      !parent.computed
    ) {
      return true;
    }
    // Check if this identifier is a property key in ObjectExpression ({ key: value })
    if (
      t.isObjectProperty(parent) &&
      parent.key === path.node &&
      !parent.computed
    ) {
      return true;
    }
    return false;
  }

  private isDestructuringKey(path: NodePath<t.Identifier>): boolean {
    const parent = path.parent;
    // In destructuring like { user: { name } }, "user" is a key, not a binding
    // The binding is in the value position
    if (
      t.isObjectProperty(parent) &&
      parent.key === path.node &&
      !parent.computed
    ) {
      // Check if we're inside a destructuring pattern (ObjectPattern)
      const grandparent = path.parentPath?.parent;
      if (t.isObjectPattern(grandparent)) {
        return true;
      }
    }
    return false;
  }

  private isTypeAnnotation(path: NodePath<t.Identifier>): boolean {
    const parent = path.parent;
    return (
      t.isTSTypeReference(parent) ||
      t.isTSTypeAnnotation(parent) ||
      t.isTSTypeParameter(parent)
    );
  }
}

export { ASTBasedPurityAnalyzer, type PurityAnalysis };
