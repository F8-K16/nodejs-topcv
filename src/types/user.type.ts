export type User = {
  id: number;
  username: string;
  email: string;
  password: string;
  isVerified: boolean;
  roles: string[];
  permissions?: string[];
};

export type UserDto = {
  email: string;
  username: string;
  password: string;
  isVerified?: boolean;
  isActive?: boolean;
  isBlocked?: boolean;
  phone?: string;
};
