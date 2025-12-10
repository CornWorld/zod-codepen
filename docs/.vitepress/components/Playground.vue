<script setup lang="ts">
import { ref, computed, onMounted, shallowRef, watch } from 'vue'
import { createHighlighter, type Highlighter } from 'shiki'

type SerializerModule = {
  serialize: (schema: unknown, options?: { format?: boolean; indent?: string }) => string
  generateModule: (schemas: Record<string, unknown>, options?: { format?: boolean; indent?: string }) => string
}

const v3Serializer = shallowRef<SerializerModule | null>(null)
const v4Serializer = shallowRef<SerializerModule | null>(null)
const zodInstance = shallowRef<typeof import('zod').z | null>(null)
const highlighter = shallowRef<Highlighter | null>(null)

const loading = ref(true)
const error = ref<string | null>(null)

const availableVersions = ref<string[]>([])
const selectedVersion = ref('')
const outputMode = ref<'serialize' | 'generateModule'>('serialize')
const schemaName = ref('UserSchema')
const formatOutput = ref(true)
const indentSize = ref(2)

const inputCode = ref(`z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).optional(),
  role: z.enum(['admin', 'user', 'guest']),
  tags: z.array(z.string()).default([]),
})`)

// Refs for syncing scroll between textarea and highlight layer
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const highlightRef = ref<HTMLDivElement | null>(null)
const isComposing = ref(false)  // 跟踪输入法状态

// Sync scroll positions
const syncScroll = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  if (highlightRef.value) {
    highlightRef.value.scrollTop = textarea.scrollTop
    highlightRef.value.scrollLeft = textarea.scrollLeft
  }
}

// 处理输入法事件
const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

onMounted(async () => {
  try {
    // Load serializers and highlighter
    const isDev = import.meta.env.DEV

    const [v3, v4, hl] = await Promise.all([
      // Use workspace link in dev, CDN in production
      isDev
        ? import('@zod-codepen/zod-v3')
        : import('https://esm.sh/@zod-codepen/zod-v3@latest'),
      isDev
        ? import('@zod-codepen/zod-v4')
        : import('https://esm.sh/@zod-codepen/zod-v4@latest'),
      createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: ['typescript']
      })
    ])

    v3Serializer.value = v3 as SerializerModule
    v4Serializer.value = v4 as SerializerModule
    highlighter.value = hl

    // Default to v4
    selectedVersion.value = '4'
  } catch (e) {
    error.value = `Failed to load: ${e instanceof Error ? e.message : String(e)}`
    loading.value = false
  }
})

watch(selectedVersion, async (ver) => {
  if (!ver) return
  
  loading.value = true
  error.value = null
  
  try {
    // Add ?dev for better error messages
    const mod = await import(/* @vite-ignore */ `https://esm.sh/zod@${ver}?dev`)
    zodInstance.value = mod.z
  } catch (e) {
    error.value = `Failed to load Zod ${ver}: ${e instanceof Error ? e.message : String(e)}`
    zodInstance.value = null
  } finally {
    loading.value = false
  }
})

const activeSerializer = computed(() => {
  const ver = selectedVersion.value
  if (!ver) return v3Serializer.value
  
  // Use v4 serializer for versions starting with 4, v4, or explicit tags
  if (
    ver.startsWith('4') || 
    ver.startsWith('v4') || 
    ver === 'latest' || 
    ver === 'beta' || 
    ver.includes('alpha')
  ) {
    return v4Serializer.value
  }
  return v3Serializer.value
})

const output = computed(() => {
  if (!zodInstance.value || !activeSerializer.value) {
    return '// Loading Zod...'
  }

  const options = {
    format: formatOutput.value,
    indent: ' '.repeat(indentSize.value)
  }

  try {
    const z = zodInstance.value
    const fn = new Function('z', `return (${inputCode.value})`)
    const schema = fn(z)

    if (outputMode.value === 'generateModule') {
      return activeSerializer.value.generateModule({ [schemaName.value]: schema }, options)
    } else {
      return activeSerializer.value.serialize(schema, options)
    }
  } catch (e) {
    return `// Error: ${e instanceof Error ? e.message : String(e)}`
  }
})

// Syntax highlighted output
const highlightedOutput = computed(() => {
  if (!highlighter.value) return output.value
  return highlighter.value.codeToHtml(output.value, {
    lang: 'typescript',
    themes: {
      light: 'github-light',
      dark: 'github-dark'
    },
    defaultColor: 'light'  // 设置默认颜色为 light
  })
})

// Syntax highlighted input (for display)
const highlightedInput = computed(() => {
  if (!highlighter.value) return inputCode.value
  return highlighter.value.codeToHtml(inputCode.value, {
    lang: 'typescript',
    themes: {
      light: 'github-light',
      dark: 'github-dark'
    },
    defaultColor: 'light'  // 设置默认颜色为 light
  })
})

// Real-world examples from vanblog project
const examples = [
  {
    name: 'User',
    desc: 'User schema with password validation',
    code: `z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  role: z.enum(['admin', 'editor', 'user']),
  permissions: z.array(z.string()).default([]),
  createdAt: z.date(),
})`
  },
  {
    name: 'Article',
    desc: 'Blog article with nested content',
    code: `z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-zA-Z0-9-_]+$/),
  content: z.string(),
  excerpt: z.string().max(500).optional(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  author: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().url().optional(),
  }),
  hidden: z.boolean().default(false),
  private: z.boolean().default(false),
  views: z.number().int().nonnegative().default(0),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
})`
  },
  {
    name: 'Pagination',
    desc: 'Query params with coercion',
    code: `z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  category: z.string().optional(),
  tag: z.string().optional(),
  hidden: z.coerce.boolean().optional(),
  search: z.string().optional(),
})`
  },
  {
    name: 'Config',
    desc: 'Environment config schema',
    code: `z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_DRIVER: z.enum(['local', 'turso', 'd1']).default('local'),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.union([
    z.string(),
    z.array(z.string())
  ]).default('*'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})`
  },
  {
    name: 'Navigation',
    desc: 'Recursive menu structure',
    code: `z.lazy(() => z.object({
  name: z.string(),
  path: z.string(),
  icon: z.string().optional(),
  external: z.boolean().default(false),
  children: z.array(
    z.lazy(() => z.object({
      name: z.string(),
      path: z.string(),
      icon: z.string().optional(),
      external: z.boolean().default(false),
    }))
  ).optional(),
}))`
  },
  {
    name: 'Analytics',
    desc: 'Event tracking with nullable fields',
    code: `z.object({
  type: z.enum(['pageview', 'event', 'api_call']),
  path: z.string().optional().nullable(),
  referrer: z.string().url().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  ip: z.string().ip().optional().nullable(),
  timestamp: z.date().default(() => new Date()),
  data: z.record(z.string(), z.unknown()).optional(),
})`
  },
  {
    name: 'File Upload',
    desc: 'File validation with MIME type',
    code: `z.object({
  filename: z.string().min(1),
  path: z.string().min(1),
  size: z.number().int().nonnegative().max(10485760),
  mimeType: z.string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\\-^_]*\\/[a-zA-Z0-9][a-zA-Z0-9!#$&\\-^_.]*$/)
    .optional(),
  hash: z.string().length(64).optional(),
  uploadedBy: z.string().uuid(),
  createdAt: z.date(),
})`
  },
  {
    name: 'Webhook',
    desc: 'HTTP webhook with response',
    code: `z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  timeout: z.number().int().min(1000).max(30000).default(5000),
  retries: z.number().int().min(0).max(3).default(0),
  response: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown(),
    duration: z.number(),
  }).optional(),
})`
  },
  {
    name: 'Transform',
    desc: 'Data transformation pipeline',
    code: `z.object({
  // JSON string to array
  tags: z.string()
    .transform(str => JSON.parse(str))
    .pipe(z.array(z.string())),

  // Normalize email
  email: z.string()
    .transform(s => s.toLowerCase().trim())
    .pipe(z.string().email()),

  // Parse date string
  date: z.string()
    .transform(s => new Date(s))
    .pipe(z.date()),

  // Default with transform
  count: z.coerce.number()
    .transform(n => Math.max(0, n))
    .default(0),
})`
  },
  {
    name: 'Discriminated',
    desc: 'Discriminated union for API responses',
    code: `z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.object({
      id: z.string(),
      items: z.array(z.unknown()),
      total: z.number(),
    }),
    meta: z.object({
      page: z.number(),
      pageSize: z.number(),
    }).optional(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
      })).optional(),
    }),
  }),
])`
  },
  {
    name: 'Comment',
    desc: 'Comment with SMTP settings',
    code: `z.object({
  'smtp.enabled': z.boolean().default(false),
  'smtp.host': z.string().default(''),
  'smtp.port': z.number().int().positive().default(587),
  'smtp.secure': z.boolean().default(true),
  'smtp.user': z.string().default(''),
  'smtp.pass': z.string().default(''),
  'sender.name': z.string().default(''),
  'sender.email': z.string().email().optional(),
  authorEmail: z.string().email().optional(),
  webhook: z.string().url().optional(),
})`
  },
  {
    name: 'Refine',
    desc: 'Custom validation with refine',
    code: `z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  minPrice: z.number(),
  maxPrice: z.number(),
}).refine(
  data => data.password === data.confirmPassword,
  { message: 'Passwords must match', path: ['confirmPassword'] }
).refine(
  data => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
).refine(
  data => data.maxPrice >= data.minPrice,
  { message: 'Max price must be >= min price', path: ['maxPrice'] }
)`
  },
]

function loadExample(ex: typeof examples[0]) {
  inputCode.value = ex.code
}

function copyOutput() {
  navigator.clipboard.writeText(output.value)
}
</script>

<template>
  <div class="playground-container">
    <!-- Loading -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error">{{ error }}</div>

    <!-- Main -->
    <template v-else>
      <!-- Nav Bar -->
      <nav class="nav-bar">
        <div class="nav-left">
          <!-- Version -->
          <div class="nav-group input-group">
            <span class="input-prefix">zod@</span>
            <input 
              v-model.lazy="selectedVersion" 
              class="version-input"
              placeholder="version"
              @keydown.enter="(e) => (e.target as HTMLInputElement).blur()"
            />
          </div>

          <div class="nav-divider"></div>

          <!-- Mode -->
          <div class="nav-group">
            <button
              :class="['nav-btn mode', { active: outputMode === 'serialize' }]"
              @mousedown.prevent="outputMode = 'serialize'"
            >serialize()</button>
            <button
              :class="['nav-btn mode', { active: outputMode === 'generateModule' }]"
              @mousedown.prevent="outputMode = 'generateModule'"
            >generateModule()</button>
          </div>

          <!-- Schema Name -->
          <input
            v-if="outputMode === 'generateModule'"
            v-model="schemaName"
            class="schema-input"
            placeholder="SchemaName"
          />

          <div class="nav-divider"></div>

          <!-- Format Options -->
          <label class="format-toggle">
            <input type="checkbox" v-model="formatOutput" />
            <span>Format</span>
          </label>
          <select v-if="formatOutput" v-model.number="indentSize" class="indent-select">
            <option :value="2">2 spaces</option>
            <option :value="4">4 spaces</option>
          </select>
        </div>

        <div class="nav-right">
          <button class="copy-btn" @click="copyOutput">Copy</button>
        </div>
      </nav>

      <!-- Examples Bar -->
      <div class="examples-bar">
        <span class="examples-label">Examples:</span>
        <div class="examples-scroll">
          <button
            v-for="ex in examples"
            :key="ex.name"
            class="example-btn"
            :title="ex.desc"
            @click="loadExample(ex)"
          >{{ ex.name }}</button>
        </div>
      </div>

      <!-- Diff View -->
      <div class="diff-view">
        <!-- Input Panel -->
        <div class="diff-panel input-panel">
          <div class="panel-header">
            <span class="panel-title">Input</span>
            <span class="panel-hint">Zod Schema</span>
          </div>
          <div class="code-container">
            <!-- Highlighted code display layer -->
            <div ref="highlightRef" class="code-highlight" v-html="highlightedInput"></div>
            <!-- Editable textarea overlay -->
            <textarea
              ref="textareaRef"
              v-model="inputCode"
              class="code-editor"
              :class="{ 'is-composing': isComposing }"
              spellcheck="false"
              placeholder="Enter Zod schema..."
              @scroll="syncScroll"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
            ></textarea>
          </div>
        </div>

        <!-- Divider -->
        <div class="diff-divider"></div>

        <!-- Output Panel -->
        <div class="diff-panel output-panel">
          <div class="panel-header">
            <span class="panel-title">Output</span>
            <span class="panel-hint">Serialized Code</span>
          </div>
          <div class="code-container code-output" v-html="highlightedOutput"></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.playground-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  background: var(--vp-c-bg);
}

.loading, .error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  height: 100%;
  color: var(--vp-c-text-2);
}

.error {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Nav Bar */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.nav-left, .nav-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-group {
  display: flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

.nav-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--vp-c-bg);
  border: none;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  user-select: none;
}

.nav-btn:not(:last-child) {
  border-right: 1px solid var(--vp-c-divider);
}

.nav-btn:hover:not(:disabled):not(.active) {
  background: var(--vp-c-bg-soft);
}

.nav-btn.active {
  background: var(--vp-c-brand-1);
  color: white;
}

.input-group {
  display: flex;
  align-items: center;
  background: var(--vp-c-bg);
}

.input-prefix {
  padding-left: 0.75rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.version-input {
  width: 80px;
  padding: 0.375rem 0.5rem 0.375rem 0.25rem;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  background: transparent;
  border: none;
  outline: none;
  color: var(--vp-c-text-1);
}

.version-input:focus {
  color: var(--vp-c-brand-1);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-btn.mode {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
}

.nav-divider {
  width: 1px;
  height: 24px;
  background: var(--vp-c-divider);
}

.schema-input {
  padding: 0.375rem 0.5rem;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  width: 120px;
}

.format-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
}

.indent-select {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
}

.copy-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: var(--vp-c-brand-1);
  color: white;
}

/* Examples Bar */
.examples-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-alt);
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.examples-label {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  flex-shrink: 0;
}

.examples-scroll {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 2px;
}

.example-btn {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.example-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* Diff View */
.diff-view {
  display: flex;
  flex: 1;
  min-height: 0;
}

.diff-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.diff-divider {
  width: 1px;
  background: var(--vp-c-divider);
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.panel-hint {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

.input-panel {
  background: var(--vp-c-bg);
}

.output-panel {
  background: var(--vp-c-bg-alt);
}

.code-container {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}

/* Highlighted code layer */
.code-highlight {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1rem;
  pointer-events: none;
  overflow: auto;
  /* Hide scrollbar */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.code-highlight::-webkit-scrollbar {
  display: none;
}

.code-editor {
  width: 100%;
  height: 100%;
  padding: 1rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  line-height: 1.6;
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  color: transparent;
  caret-color: var(--vp-c-text-1);
  position: relative;
  z-index: 1;
  -webkit-text-fill-color: transparent;
}

/* 输入法输入时显示文字 */
.code-editor.is-composing {
  color: var(--vp-c-text-1);
  -webkit-text-fill-color: var(--vp-c-text-1);
  opacity: 0.9;
}

/* 选中文字时也显示 */
.code-editor:focus {
  box-shadow: inset 0 0 0 2px var(--vp-c-brand-soft);
}

/* 输入法候选文字样式 */
.code-editor::-webkit-input-placeholder {
  color: var(--vp-c-text-3);
  -webkit-text-fill-color: var(--vp-c-text-3);
}

/* Make the text visible on focus for accessibility */
.code-editor::selection {
  background: var(--vp-c-brand-soft);
  color: transparent;
}

.code-editor::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.code-editor::-webkit-scrollbar-thumb {
  background: var(--vp-c-divider);
  border-radius: 4px;
}

.code-editor::-webkit-scrollbar-thumb:hover {
  background: var(--vp-c-text-3);
}

.code-output {
  padding: 1rem;
}

/* Shiki output styling - VitePress handles theme switching automatically */
.code-output :deep(pre),
.code-highlight :deep(pre) {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  line-height: 1.6;
}

.code-output :deep(code),
.code-highlight :deep(code) {
  font-family: inherit;
  background: transparent !important;
}

/* Shiki 双主题支持 - 使用生成的内联样式和 CSS 变量 */
/* 确保 pre 背景透明 */
.code-output :deep(.shiki),
.code-highlight :deep(.shiki) {
  background: transparent !important;
}

/* 暗色模式：覆盖内联 style，使用 --shiki-dark 变量 */
html.dark .code-output :deep(.shiki span),
html.dark .code-highlight :deep(.shiki span) {
  color: var(--shiki-dark) !important;
}

/* Responsive */
@media (max-width: 768px) {
  .nav-bar {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .nav-left {
    flex-wrap: wrap;
  }

  .diff-view {
    flex-direction: column;
  }

  .diff-divider {
    width: 100%;
    height: 1px;
  }

  .diff-panel {
    min-height: 40vh;
  }
}
</style>
