import {
  IsEnum,
} from "class-validator";

export enum UserRole {
  USER = "USER",
  HEALER = "HEALER",
  ADMIN = "ADMIN",
}

export class AssignRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}