export type CompanyDTO = {
  name: string;
  description?: string;
  location: string;
  website?: string;
  logo?: string;
  status?: boolean;
  provinceId: number;
  districtId: number;
  categoryIds?: number[];
};
