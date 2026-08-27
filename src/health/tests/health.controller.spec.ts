import {
  Test,
} from "@nestjs/testing";

import {
  HealthController,
} from "../health.controller";

describe(
  "HealthController",
  () => {

    let controller:
      HealthController;

    beforeEach(
      async () => {

        const module =
          await Test.createTestingModule({
            controllers: [
              HealthController,
            ],

            providers: [
              {
                provide:
                  "HealthCheckService",

                useValue: {},
              },
            ],
          }).compile();

        controller =
          module.get(
            HealthController,
          );
      },
    );

    it(
      "should be defined",
      () => {
        expect(
          controller,
        ).toBeDefined();
      },
    );
  },
);