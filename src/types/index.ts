export type UserRole = 'admin' | 'manager' | 'employee';

export type EmployeeType = 'fixed' | 'substitute';

export type ClockType = 'entry' | 'lunch_out' | 'lunch_in' | 'exit';

export type ClockMethod = 'qr' | 'gps';

export type NotificationScope = 'all' | 'location' | 'employee';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Location {
  id: string;
  company_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  qr_code: string;
  created_at: string;
}

export interface Employee {
  id: string;
  user_id: string;
  company_id: string;
  type: EmployeeType;
  is_active: boolean;
  name: string;
  created_at: string;
}

export interface FixedSchedule {
  id: string;
  employee_id: string;
  location_id: string;
  day_of_week: number;
  works: boolean;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
}

export interface PunctualSchedule {
  id: string;
  employee_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
}

export interface ClockRecord {
  id: string;
  employee_id: string;
  location_id: string;
  type: ClockType;
  timestamp: string;
  method: ClockMethod;
  latitude?: number;
  longitude?: number;
}

export interface NotificationRecipient {
  id: string;
  company_id: string;
  name: string;
  whatsapp: string;
  receives_entry: boolean;
  receives_lunch_out: boolean;
  receives_lunch_in: boolean;
  receives_exit: boolean;
  receives_alerts: boolean;
  scope_type: NotificationScope;
  scope_id?: string;
}

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

export const CLOCK_TYPE_LABELS: Record<ClockType, string> = {
  entry: 'Entrada',
  lunch_out: 'Saída Almoço',
  lunch_in: 'Volta Almoço',
  exit: 'Saída',
};
