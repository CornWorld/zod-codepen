/**
 * 数值格式化工具
 * 只做确定性的转换，不做任何猜测
 */

/**
 * 将数值转换为更可读的格式
 * 优先使用 JavaScript 内置常量或科学记数法（2的幂次）
 */
export function formatNumber(value: number): string {
  // JavaScript 内置常量
  if (value === Number.MAX_SAFE_INTEGER) {
    return 'Number.MAX_SAFE_INTEGER';
  }
  if (value === Number.MIN_SAFE_INTEGER) {
    return 'Number.MIN_SAFE_INTEGER';
  }

  // 检查是否是 2 的幂次相关的特殊值
  const powerOfTwoFormat = getPowerOfTwoFormat(value);
  if (powerOfTwoFormat) {
    return powerOfTwoFormat;
  }

  // 默认返回原始数值
  return String(value);
}

/**
 * 格式化 BigInt
 */
export function formatBigInt(value: bigint): string {
  // 64位整数边界（这些是确定的，不是猜测）
  if (value === 9223372036854775807n) {
    return '2n**63n - 1n'; // INT64 MAX
  }
  if (value === -9223372036854775808n) {
    return '-2n**63n'; // INT64 MIN
  }
  if (value === 18446744073709551615n) {
    return '2n**64n - 1n'; // UINT64 MAX
  }

  // 检查是否是 2 的幂次
  const powerFormat = getBigIntPowerFormat(value);
  if (powerFormat) {
    return powerFormat;
  }

  return `${value}n`;
}

/**
 * 检查是否是 2 的幂次相关的值
 */
function getPowerOfTwoFormat(value: number): string | null {
  // 正数：2^n - 1 (有符号整数最大值)
  const powersMinusOne: Record<number, string> = {
    127: '2**7 - 1',           // INT8 MAX
    32767: '2**15 - 1',        // INT16 MAX
    2147483647: '2**31 - 1',   // INT32 MAX
    // JavaScript 中 2^53-1 已经用 MAX_SAFE_INTEGER 表示
  };

  // 负数：-2^n (有符号整数最小值)
  const negativePowers: Record<string, string> = {
    '-128': '-2**7',           // INT8 MIN
    '-32768': '-2**15',        // INT16 MIN
    '-2147483648': '-2**31',   // INT32 MIN
  };

  // 2的幂次（常用于无符号整数边界）
  const powers: Record<number, string> = {
    256: '2**8',               // UINT8 MAX + 1
    65536: '2**16',            // UINT16 MAX + 1
    4294967296: '2**32',       // UINT32 MAX + 1
  };

  // 无符号整数最大值
  const unsignedMax: Record<number, string> = {
    255: '2**8 - 1',           // UINT8 MAX
    65535: '2**16 - 1',        // UINT16 MAX
    4294967295: '2**32 - 1',   // UINT32 MAX
  };

  return powersMinusOne[value] ||
         negativePowers[String(value)] ||
         powers[value] ||
         unsignedMax[value] ||
         null;
}

/**
 * 检查 BigInt 是否是 2 的幂次
 */
function getBigIntPowerFormat(value: bigint): string | null {
  // 只处理常见的 2 的幂次
  const absValue = value < 0n ? -value : value;

  // 检查是否是 2 的幂
  if ((absValue & (absValue - 1n)) === 0n && absValue > 0n) {
    // 计算是 2 的几次方
    let power = 0n;
    let temp = absValue;
    while (temp > 1n) {
      temp = temp >> 1n;
      power++;
    }

    // 只处理合理范围的幂次（8, 16, 32, 64）
    if ([8n, 16n, 32n, 64n].includes(power)) {
      return value < 0n ? `-2n**${power}n` : `2n**${power}n`;
    }
  }

  // 检查是否是 2^n - 1
  const plusOne = absValue + 1n;
  if ((plusOne & (plusOne - 1n)) === 0n && plusOne > 0n) {
    let power = 0n;
    let temp = plusOne;
    while (temp > 1n) {
      temp = temp >> 1n;
      power++;
    }

    if ([8n, 16n, 32n, 64n].includes(power)) {
      return value < 0n ? `-(2n**${power}n - 1n)` : `2n**${power}n - 1n`;
    }
  }

  return null;
}