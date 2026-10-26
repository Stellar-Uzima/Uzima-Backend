import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (property: string | undefined, context: ExecutionContext) => {
    const { user } = context.switchToHttp().getRequest();
    return property ? user?.[property] : user;
  }
);
