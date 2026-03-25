export type IndustryRule = {
  majorCodes?: string[];
  middleCodes?: string[];
  subCodes?: string[];
  keywords?: string[];
};

const I2 = ["I2"]; // 음식
const G2 = ["G2"]; // 소매
const S2 = ["S2"]; // 개인서비스
const P1 = ["P1"]; // 교육
const Q1 = ["Q1"]; // 보건
const R1 = ["R1"]; // 예술/스포츠/여가
const N1 = ["N1"]; // 부동산/임대 계열 가능성
const M1 = ["M1"]; // 수리/전문서비스 계열 가능성

export const INDUSTRY_RULES: Record<string, IndustryRule> = {
  // ─────────────────────────────────────
  // 카페 / 디저트 / 베이커리
  // ─────────────────────────────────────
  cafe_indie_small: {
    majorCodes: I2,
    subCodes: ["I21201"],
    keywords: ["카페", "커피", "커피전문점", "커피숍"],
  },

  cafe_franchise_large: {
    majorCodes: I2,
    subCodes: ["I21201"],
    keywords: ["카페", "커피", "커피전문점", "커피숍"],
  },

  cafe: {
    majorCodes: I2,
    subCodes: ["I21201"],
    keywords: ["카페", "커피", "커피전문점", "커피숍"],
  },

  dessert_takeout: {
    majorCodes: I2,
    keywords: ["디저트", "테이크아웃", "마카롱", "케이크", "와플", "타르트"],
  },

  bakery_production: {
    majorCodes: I2,
    subCodes: ["I21001"],
    keywords: ["빵", "도넛", "베이커리", "제과", "빵집"],
  },

  bakery_cafe_hybrid: {
    majorCodes: I2,
    keywords: ["베이커리카페", "베이커리 카페", "빵", "도넛", "베이커리", "카페", "제과"],
  },

  // ─────────────────────────────────────
  // 일반 음식점
  // ─────────────────────────────────────
  restaurant_korean_casual: {
    majorCodes: I2,
    middleCodes: ["I201"],
    keywords: ["한식", "백반", "분식", "국밥", "찌개", "식당", "기사식당"],
  },

  restaurant_korean: {
    majorCodes: I2,
    middleCodes: ["I201"],
    keywords: ["한식", "백반", "분식", "국밥", "찌개", "식당", "기사식당"],
  },

  restaurant_chinese: {
    majorCodes: I2,
    middleCodes: ["I202"],
    keywords: ["중식", "중국집", "짜장", "짬뽕", "마라", "탕수육"],
  },

  restaurant_japanese_sushi: {
    majorCodes: I2,
    middleCodes: ["I203"],
    keywords: ["일식", "초밥", "스시", "우동", "돈카츠", "라멘", "사시미"],
  },

  restaurant_japanese: {
    majorCodes: I2,
    middleCodes: ["I203"],
    keywords: ["일식", "초밥", "스시", "우동", "돈카츠", "라멘", "사시미"],
  },

  restaurant_bbq: {
    majorCodes: I2,
    keywords: ["고깃집", "고기집", "갈비", "삼겹살", "불고기", "구이", "BBQ", "바비큐"],
  },

  restaurant_western: {
    majorCodes: I2,
    keywords: ["양식", "파스타", "스테이크", "리조또", "브런치", "피자", "이탈리안"],
  },

  delivery_chicken_pizza: {
    majorCodes: I2,
    keywords: ["치킨", "피자"],
  },

  fast_food_qsr: {
    majorCodes: I2,
    keywords: ["패스트푸드", "햄버거", "버거", "샌드위치", "핫도그", "토스트"],
  },

  pub_bar: {
    majorCodes: I2,
    keywords: ["주점", "호프", "술집", "바", "이자카야", "맥주", "포차"],
  },

  bunsik_gimbap: {
    majorCodes: I2,
    keywords: ["분식", "김밥", "떡볶이", "라볶이", "순대", "김밥천국"],
  },

  salad_health_food: {
    majorCodes: I2,
    keywords: ["샐러드", "건강식", "포케", "다이어트", "웰빙", "샌드위치"],
  },

  // ─────────────────────────────────────
  // 편의점 / 소매
  // ─────────────────────────────────────
  convenience_store: {
    majorCodes: G2,
    subCodes: ["G20405"],
    keywords: ["편의점"],
  },

  convenience_store_franchise: {
    majorCodes: G2,
    subCodes: ["G20405"],
    keywords: ["편의점"],
  },

  convenience: {
    majorCodes: G2,
    subCodes: ["G20405"],
    keywords: ["편의점"],
  },

  local_supermarket_mart: {
    majorCodes: G2,
    keywords: ["슈퍼", "마트", "동네슈퍼", "동네마트", "식자재마트"],
  },

  fruit_vegetable_specialty: {
    majorCodes: G2,
    keywords: ["과일", "채소", "청과", "야채", "청과물", "과일전문점"],
  },

  butcher_shop: {
    majorCodes: G2,
    keywords: ["정육점", "축산", "정육", "고기판매"],
  },

  beauty_cosmetics_retail: {
    majorCodes: G2,
    keywords: ["화장품", "뷰티", "코스메틱", "올리브영", "뷰티스토어"],
  },

  clothing_casual_retail: {
    majorCodes: G2,
    keywords: ["의류", "옷", "캐주얼", "패션", "의류 소매"],
  },

  stationery_fancy: {
    majorCodes: G2,
    keywords: ["문구", "팬시", "사무용품", "문구점"],
  },

  flower_shop: {
    majorCodes: G2,
    keywords: ["꽃집", "꽃", "플라워", "화원", "화훼", "플로리스트", "florist", "flower"],
  },

  pet_supplies_shop: {
    majorCodes: G2,
    keywords: ["반려동물", "애견용품", "펫샵", "펫", "강아지용품", "고양이용품"],
  },

  mobile_phone_shop: {
    majorCodes: G2,
    keywords: ["휴대폰", "핸드폰", "휴대폰 판매", "이동통신", "대리점", "판매점"],
  },

  small_lifestyle_goods: {
    majorCodes: G2,
    keywords: ["잡화", "생활용품", "소형 잡화", "생활잡화", "생활용품점"],
  },

  retail: {
    majorCodes: G2,
    keywords: ["소매", "판매", "매장"],
  },

  // ─────────────────────────────────────
  // 뷰티 / 생활서비스
  // ─────────────────────────────────────
  hair_salon: {
    majorCodes: S2,
    middleCodes: ["S207"],
    subCodes: ["S20701"],
    keywords: ["미용실", "헤어", "헤어샵", "두발", "살롱"],
  },

  beauty: {
    majorCodes: S2,
    middleCodes: ["S207"],
    keywords: ["미용실", "헤어", "헤어샵", "두발", "살롱"],
  },

  nail_lash_studio: {
    majorCodes: S2,
    middleCodes: ["S207"],
    keywords: ["네일", "속눈썹", "네일아트", "래쉬", "속눈썹펌"],
  },

  massage_spa: {
    majorCodes: [...S2, ...Q1],
    keywords: ["마사지", "스파", "피부 관리실", "피부관리", "에스테틱"],
  },

  laundromat_general: {
    majorCodes: S2,
    keywords: ["세탁소", "의류세탁", "세탁"],
  },

  laundromat_self: {
    majorCodes: S2,
    keywords: ["셀프빨래방", "코인빨래방", "코인세탁", "무인세탁"],
  },

  self_storage_unmanned: {
    majorCodes: [...S2, ...N1],
    keywords: ["무인창고", "셀프스토리지", "셀프 스토리지", "보관창고", "스토리지"],
  },

  unmanned_icecream_store: {
    majorCodes: G2,
    keywords: ["무인 아이스크림", "무인아이스크림", "무인매장", "아이스크림 할인점"],
  },

  study_cafe: {
    majorCodes: [...R1, ...P1],
    keywords: ["스터디카페", "독서실", "스터디 카페"],
  },

  coin_karaoke: {
    majorCodes: R1,
    keywords: ["코인노래방", "노래방", "코노"],
  },

  pc_cafe: {
    majorCodes: R1,
    keywords: ["PC방", "피시방", "게임방", "인터넷카페"],
  },

  // ─────────────────────────────────────
  // 스포츠 / 헬스
  // ─────────────────────────────────────
  gym_pt: {
    majorCodes: R1,
    keywords: ["헬스", "PT", "피트니스", "짐", "헬스장", "퍼스널트레이닝"],
  },

  pilates_yoga: {
    majorCodes: R1,
    keywords: ["필라테스", "요가"],
  },

  // ─────────────────────────────────────
  // 교육
  // ─────────────────────────────────────
  academy_cram: {
    majorCodes: P1,
    keywords: ["보습학원", "입시학원", "학원", "종합학원"],
  },

  academy_language: {
    majorCodes: P1,
    keywords: ["어학원", "영어학원", "중국어학원", "일본어학원"],
  },

  academy_music: {
    majorCodes: P1,
    keywords: ["음악학원", "피아노학원", "보컬학원", "실용음악"],
  },

  academy_art: {
    majorCodes: P1,
    keywords: ["미술학원", "화실", "드로잉", "디자인학원"],
  },

  kids_experience_small: {
    majorCodes: [...P1, ...R1],
    keywords: ["키즈", "체험", "놀이", "키즈카페", "아동체험", "유아체험"],
  },

  // ─────────────────────────────────────
  // 의료
  // ─────────────────────────────────────
  clinic_primary: {
    majorCodes: Q1,
    keywords: ["의원", "클리닉", "내과", "가정의학과", "소아과", "이비인후과", "피부과"],
  },

  clinic_dental: {
    majorCodes: Q1,
    keywords: ["치과"],
  },

  pharmacy: {
    majorCodes: G2,
    keywords: ["약국"],
  },

  // ─────────────────────────────────────
  // 부동산 / 서비스
  // ─────────────────────────────────────
  real_estate_broker: {
    majorCodes: [...N1, ...M1],
    keywords: ["부동산", "공인중개사", "중개", "부동산 중개"],
  },

  repair_mobile_electronics: {
    majorCodes: [...S2, ...M1],
    keywords: ["수리", "리페어", "휴대폰수리", "전자수리", "액정수리"],
  },

  print_copy: {
    majorCodes: [...S2, ...M1],
    keywords: ["인쇄", "복사", "출력", "제본", "프린트"],
  },

  car_wash_self: {
    majorCodes: S2,
    keywords: ["세차장", "자동세차", "셀프세차", "셀프 세차"],
  },

  auto_repair_tire: {
    majorCodes: [...S2, ...M1],
    keywords: ["자동차 정비", "정비", "카센터", "타이어", "엔진오일"],
  },

  // ─────────────────────────────────────
  // 호환용 별칭 코드들
  // UI/기존 코드에서 다른 internal_code를 쓸 경우 대비
  // ─────────────────────────────────────
  restaurant_western_japanese: {
    majorCodes: I2,
    keywords: ["양식", "일식", "초밥", "스시", "파스타", "우동", "돈카츠"],
  },

  convenience_store_chain: {
    majorCodes: G2,
    subCodes: ["G20405"],
    keywords: ["편의점"],
  },

  academy_exam: {
    majorCodes: P1,
    keywords: ["보습학원", "입시학원", "학원", "종합학원"],
  },

  clinic_first_care: {
    majorCodes: Q1,
    keywords: ["의원", "클리닉", "내과", "가정의학과", "소아과", "이비인후과"],
  },

  hair_beauty: {
    majorCodes: S2,
    keywords: ["미용실", "헤어", "헤어샵", "두발", "살롱"],
  },

  pet_shop: {
    majorCodes: G2,
    keywords: ["반려동물", "애견용품", "펫샵", "펫", "강아지용품", "고양이용품"],
  },

  self_laundry: {
    majorCodes: S2,
    keywords: ["셀프빨래방", "코인빨래방", "코인세탁", "무인세탁"],
  },

  self_storage: {
    majorCodes: [...S2, ...N1],
    keywords: ["무인창고", "셀프스토리지", "셀프 스토리지", "보관창고", "스토리지"],
  },

  gym: {
    majorCodes: R1,
    keywords: ["헬스", "PT", "피트니스", "짐", "헬스장", "퍼스널트레이닝"],
  },

  yoga_pilates: {
    majorCodes: R1,
    keywords: ["필라테스", "요가"],
  },

  kids_experience: {
    majorCodes: [...P1, ...R1],
    keywords: ["키즈", "체험", "놀이", "키즈카페", "아동체험", "유아체험"],
  },

  real_estate: {
    majorCodes: [...N1, ...M1],
    keywords: ["부동산", "공인중개사", "중개", "부동산 중개"],
  },

  phone_shop: {
    majorCodes: G2,
    keywords: ["휴대폰", "핸드폰", "휴대폰 판매", "이동통신", "대리점", "판매점"],
  },

  car_wash: {
    majorCodes: S2,
    keywords: ["세차장", "자동세차", "셀프세차", "셀프 세차"],
  },

  auto_repair: {
    majorCodes: [...S2, ...M1],
    keywords: ["자동차 정비", "정비", "카센터", "타이어", "엔진오일"],
  },
};
