export function getQuantFormulaText(hasClickStage: boolean): string {
  return hasClickStage
    ? 'GMV = 曝光 × 点击率 × 点击加购率 × 加购转化率 × 客单价'
    : 'GMV = 访客 × 点击加购率 × 加购转化率 × 客单价';
}
