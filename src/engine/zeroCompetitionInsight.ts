export type ZeroCompetitionInsight = {
  type: "opportunity" | "risk" | "neutral";
  label: string;
  message: string;
} | null;

type ZeroCompetitionInput = {
  competitorsCount: number;
  poiTotalCount: number;
  population: number;
};

export function getZeroCompetitionInsight(
  input: ZeroCompetitionInput
): ZeroCompetitionInsight {
  const { competitorsCount, poiTotalCount, population } = input;

  if (competitorsCount > 0) {
    return null;
  }

  if (poiTotalCount >= 80 && population >= 3000) {
    return {
      type: "opportunity",
      label: "경쟁 공백 기회",
      message:
        "현재 반경 내 동일 업종이 확인되지 않습니다. 상권은 활성화되어 있어 신규 진입 기회가 있을 수 있습니다.",
    };
  }

  if (poiTotalCount < 40 && population < 2000) {
    return {
      type: "risk",
      label: "수요 부족 가능성",
      message:
        "주변 상권 자체가 약해 해당 업종 수요가 부족할 수 있습니다. 입지 재검토 또는 업종 변경을 함께 검토하세요.",
    };
  }

  return {
    type: "neutral",
    label: "추가 검토 필요",
    message:
      "경쟁 매장은 없지만 상권 규모가 제한적이거나 애매합니다. 현장 조사와 시간대별 유동 확인을 권장합니다.",
  };
}