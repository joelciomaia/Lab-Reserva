export type UserRole = 'TEACHER' | 'LAB_TECHNICIAN' | 'ADMINISTRATOR';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  authenticationMode: 'INSTITUTIONAL' | 'SIMPLIFIED';
}
