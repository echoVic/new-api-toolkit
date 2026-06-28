// 入口：脚本保证 models.generated.ts 总存在（拉取成功=真实数据，失败=fallback 复制）。
// 现有 `from '../data/models'` 引用无需改动。
export type { ModelPreset } from './modelPreset'
export { PRICE_UPDATED_AT, MODEL_PRESETS } from './models.generated'
