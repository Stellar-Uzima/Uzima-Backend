import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

jest.mock("bcrypt");

describe("AuthService", () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

    describe("register", () => {
    it("should register a new user with hashed password", async () => {
      const dto = {
        email: "test@example.com",
        password: "password123",
      };

      usersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pw");

      usersService.create.mockResolvedValue({
        id: "1",
        ...dto,
        password: "hashed_pw",
      } as any);

      const result = await service.register(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, expect.any(Number));
      expect(usersService.create).toHaveBeenCalled();
      expect(result.password).not.toBe(dto.password);
    });

    it("should throw if email already exists", async () => {
      usersService.findByEmail.mockResolvedValue({ id: "1" } as any);

      await expect(
        service.register({
          email: "test@example.com",
          password: "123",
        })
      ).rejects.toThrow();
    });
  });


  describe("login", () => {
    it("should login with valid credentials", async () => {
      const user = {
        id: "1",
        email: "test@example.com",
        password: "hashed_pw",
      };

      usersService.findByEmail.mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue("token");

      const result = await service.login({
        email: user.email,
        password: "password123",
      });

      expect(result.accessToken).toBe("token");
    });

    it("should throw for invalid email", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: "wrong@test.com",
          password: "123",
        })
      ).rejects.toThrow();
    });

    it("should throw for wrong password", async () => {
      usersService.findByEmail.mockResolvedValue({
        password: "hashed_pw",
      } as any);

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: "test@test.com",
          password: "wrong",
        })
      ).rejects.toThrow();
    });
  });

    describe("generateToken", () => {
    it("should generate JWT token", async () => {
      jwtService.sign.mockReturnValue("jwt_token");

      const result = service.generateToken({
        id: "1",
        email: "test@example.com",
      } as any);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: "1",
        })
      );

      expect(result).toBe("jwt_token");
    });
  });

    describe("password hashing", () => {
    it("should hash password correctly", async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pw");

      const result = await service.hashPassword("plain");

      expect(result).toBe("hashed_pw");
    });

    it("should compare passwords correctly", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.comparePasswords(
        "plain",
        "hashed"
      );

      expect(result).toBe(true);
    });
  });

    describe("edge cases", () => {
    it("should handle empty credentials", async () => {
      await expect(
        service.login({ email: "", password: "" })
      ).rejects.toThrow();
    });

    it("should handle null inputs", async () => {
      await expect(service.register(null as any)).rejects.toThrow();
    });

    it("should not expose password in response", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pw");

      usersService.create.mockResolvedValue({
        id: "1",
        email: "test@test.com",
        password: "hashed_pw",
      } as any);

      const result = await service.register({
        email: "test@test.com",
        password: "123",
      });

      expect(result.password).toBeUndefined();
    });
  });
});

