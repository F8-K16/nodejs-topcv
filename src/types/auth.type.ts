export type RegisterDto = {
  email: string;
  username: string;
  password: string;
  phone: string;
  isVerified: boolean;
  roles: Array<number | string>;
  companyName?: string;
  location?: string;
  provinceId?: number;
  districtId?: number;
  inviteToken?: string;
};
