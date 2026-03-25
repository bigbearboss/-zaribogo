export type IndustryRule = {
  majorCodes?: string[];
  middleCodes?: string[];
  subCodes?: string[];
  keywords?: string[];
};

export const INDUSTRY_RULES: Record<string, IndustryRule> = {
  hair_salon: {
    majorCodes: ["S2"],
    middleCodes: ["S207"],
    subCodes: ["S20701"],
    keywords: ["미용실", "헤어"],
  },

  nail_lash_studio: {
    majorCodes: ["S2"],
    middleCodes: ["S207"],
    keywords: ["네일", "속눈썹", "네일아트"],
  },

  massage_spa: {
    majorCodes: ["S2", "Q1"],
    keywords: ["마사지", "스파", "피부 관리실"],
  },

  convenience_store: {
    majorCodes: ["G2"],
    subCodes: ["G20405"],
    keywords: ["편의점"],
  },

  cafe_indie_small: {
    majorCodes: ["I2"],
    subCodes: ["I21201"],
    keywords: ["카페", "커피"],
  },

  cafe_franchise_large: {
    majorCodes: ["I2"],
    subCodes: ["I21201"],
    keywords: ["카페", "커피"],
  },

  bakery_production: {
    majorCodes: ["I2"],
    subCodes: ["I21001"],
    keywords: ["빵", "도넛", "베이커리", "제과"],
  },

  bakery_cafe_hybrid: {
    majorCodes: ["I2"],
    keywords: ["빵", "도넛", "베이커리", "카페", "제과"],
  },

  restaurant_korean_casual: {
    majorCodes: ["I2"],
    middleCodes: ["I201"],
    keywords: ["한식", "백반", "분식", "국밥", "식당"],
  },

  restaurant_chinese: {
    majorCodes: ["I2"],
    middleCodes: ["I202"],
    keywords: ["중식", "중국집", "짜장", "짬뽕"],
  },

  restaurant_japanese_sushi: {
    majorCodes: ["I2"],
    middleCodes: ["I203"],
    keywords: ["일식", "초밥", "스시", "우동", "돈카츠"],
  },

  delivery_chicken_pizza: {
    majorCodes: ["I2"],
    keywords: ["치킨", "피자"],
  },

  academy_cram: {
    majorCodes: ["P1"],
    keywords: ["보습학원", "입시학원", "학원"],
  },

  clinic_primary: {
    majorCodes: ["Q1"],
    keywords: ["의원", "클리닉", "내과", "가정의학과"],
  },

  clinic_dental: {
    majorCodes: ["Q1"],
    keywords: ["치과"],
  },

  pharmacy: {
    majorCodes: ["G2"],
    keywords: ["약국"],
  },
};
