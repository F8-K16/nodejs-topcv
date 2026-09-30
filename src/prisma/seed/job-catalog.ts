export type CatalogCategory = { name: string; slug: string };
export type CatalogParent = {
  name: string;
  slug: string;
  categories: CatalogCategory[];
};

export const JOB_CATEGORY_CATALOG: CatalogParent[] = [
  {
    name: "Công nghệ thông tin",
    slug: "cong-nghe-thong-tin",
    categories: [
      { name: "Lập trình Backend", slug: "backend-developer" },
      { name: "Lập trình Frontend", slug: "frontend-developer" },
      { name: "Lập trình Mobile", slug: "mobile-developer" },
      { name: "Phân tích dữ liệu", slug: "data-analyst" },
      { name: "Phân tích nghiệp vụ", slug: "business-analyst" },
      { name: "Kiểm thử phần mềm", slug: "kiem-thu-phan-mem" },
    ],
  },
  {
    name: "Kinh doanh",
    slug: "kinh-doanh",
    categories: [
      { name: "Kinh doanh / Bán hàng", slug: "sales-executive" },
      { name: "Quản lý sản phẩm", slug: "product-manager" },
      { name: "Chăm sóc khách hàng", slug: "cham-soc-khach-hang" },
    ],
  },
  {
    name: "Marketing - Truyền thông",
    slug: "marketing-truyen-thong",
    categories: [
      { name: "Digital Marketing", slug: "digital-marketing" },
      { name: "Content / Livestream", slug: "content-livestream" },
    ],
  },
  {
    name: "Xây dựng",
    slug: "xay-dung",
    categories: [
      { name: "Kỹ sư xây dựng", slug: "ky-su-xay-dung" },
      { name: "Dự toán / QS", slug: "du-toan-qs" },
      { name: "Giám sát công trình", slug: "giam-sat-cong-trinh" },
      { name: "Kiến trúc / Nội thất", slug: "kien-truc-noi-that" },
    ],
  },
  {
    name: "Cơ khí - Điện",
    slug: "co-khi-dien",
    categories: [
      { name: "Cơ khí", slug: "co-khi" },
      { name: "Điện / Tự động hóa", slug: "dien-tu-dong-hoa" },
    ],
  },
  {
    name: "Kế toán - Tài chính",
    slug: "ke-toan-tai-chinh",
    categories: [
      { name: "Kế toán", slug: "ke-toan" },
      { name: "Tài chính / Ngân hàng", slug: "tai-chinh-ngan-hang" },
    ],
  },
  {
    name: "Nhân sự",
    slug: "nhan-su",
    categories: [{ name: "Nhân sự / Tuyển dụng", slug: "nhan-su-tuyen-dung" }],
  },
  {
    name: "Giáo dục",
    slug: "giao-duc",
    categories: [{ name: "Giáo viên / Giảng viên", slug: "giao-vien" }],
  },
  {
    name: "Nhà hàng - Khách sạn",
    slug: "nha-hang-khach-san",
    categories: [{ name: "Nhà hàng / Khách sạn", slug: "nha-hang-khach-san" }],
  },
  {
    name: "Pháp lý",
    slug: "phap-ly",
    categories: [{ name: "Pháp lý / Pháp chế", slug: "phap-ly" }],
  },
  {
    name: "Logistics - Xuất nhập khẩu",
    slug: "logistics-xuat-nhap-khau",
    categories: [
      { name: "Logistics / Xuất nhập khẩu", slug: "logistics-xuat-nhap-khau" },
    ],
  },
  {
    name: "Bất động sản",
    slug: "bat-dong-san",
    categories: [{ name: "Bất động sản", slug: "bat-dong-san" }],
  },
  {
    name: "Vận hành - Sản xuất",
    slug: "van-hanh-san-xuat",
    categories: [
      { name: "Vận hành", slug: "operations-specialist" },
      { name: "Sản xuất", slug: "san-xuat" },
    ],
  },
  {
    name: "Khác",
    slug: "khac",
    categories: [{ name: "Khác", slug: "khac" }],
  },
];

export const classifyJobCategorySlug = (title: string) => {
  const text = title.toLowerCase();
  if (/frontend|react|vue|angular/.test(text)) return "frontend-developer";
  if (/mobile|android|ios|flutter|kotlin/.test(text)) return "mobile-developer";
  if (/business analyst|phân tích nghiệp vụ/.test(text)) return "business-analyst";
  if (/tester|qa\b|qc\b|kiểm thử/.test(text)) return "kiem-thu-phan-mem";
  if (/data|phân tích dữ liệu|machine learning/.test(text)) return "data-analyst";
  if (
    /backend|java|node\.?js|php|\.net|golang|python|developer|lập trình|kỹ sư phần mềm|software/.test(
      text,
    )
  ) {
    return "backend-developer";
  }
  if (/livestream|tiktok|content|seo|social|marketing|truyền thông|\bmc\b/.test(text)) {
    return /livestream|tiktok|\bmc\b|host/.test(text)
      ? "content-livestream"
      : "digital-marketing";
  }
  if (/product manager|quản lý sản phẩm/.test(text)) return "product-manager";
  if (/kế toán|ketoan|accounting/.test(text)) return "ke-toan";
  if (/tài chính|ngân hàng|tín dụng|\brm\b|srbo/.test(text)) return "tai-chinh-ngan-hang";
  if (/nhân sự|tuyển dụng|hr\b|human resource/.test(text)) return "nhan-su-tuyen-dung";
  if (/giáo viên|giảng viên|gia sư|teacher/.test(text)) return "giao-vien";
  if (/nhà hàng|khách sạn|bếp|phục vụ|bartender|kitchen|barista/.test(text)) {
    return "nha-hang-khach-san";
  }
  if (/pháp lý|pháp chế|luật sư|legal/.test(text)) return "phap-ly";
  if (/hải quan|logistics|xuất nhập khẩu|forwarder|chứng từ|kho vận/.test(text)) {
    return "logistics-xuat-nhap-khau";
  }
  if (/bất động sản|môi giới|real estate/.test(text)) return "bat-dong-san";
  if (/kiến trúc|nội thất|bim|thiết kế/.test(text)) return "kien-truc-noi-that";
  if (/dự toán|\bqs\b|quantity survey/.test(text)) return "du-toan-qs";
  if (/giám sát|công trình|công trường|xây dựng|kết cấu|cốp pha/.test(text)) {
    return "ky-su-xay-dung";
  }
  if (/cơ khí|cơ điện/.test(text)) return "co-khi";
  if (/điện|tự động hóa|bảo trì|kỹ thuật viên/.test(text)) return "dien-tu-dong-hoa";
  if (/chăm sóc khách hàng|tổng đài|customer service|cskh/.test(text)) {
    return "cham-soc-khach-hang";
  }
  if (/kinh doanh|sales|telesales|bán hàng|account|sale\b/.test(text)) {
    return "sales-executive";
  }
  if (/sản xuất|nhà máy|công nhân/.test(text)) return "san-xuat";
  if (/vận hành|kho\b|operation/.test(text)) return "operations-specialist";
  return "khac";
};
