/**
 * qq-mode 行的转发垫片。
 *
 * 为什么不直接把 loader 行指到 ../surfcore/lib/qq-mode.js：
 * 宿主的 client-modules 会按 loader 行文件最近的 package.json 找 dsh.client，
 * 指到旧包里就等于把废弃的旧设置界面一起加载进来。
 * 这里放在独立的小包里（没有 dsh.client 声明），只转发 host 半的 Config。
 */
export * from "../../../backend/lib/qq-mode.js";
