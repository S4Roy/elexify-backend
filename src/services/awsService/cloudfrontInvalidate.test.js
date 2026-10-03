import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import { envs } from "../../config/index.js";
import { invalidatePaths } from "./cloudfrontInvalidate.js";

const cfMock = mockClient(CloudFrontClient);
const originalDistributionId = envs.aws.cloudfrontDistributionId;

beforeEach(() => {
  cfMock.reset();
  envs.aws.cloudfrontDistributionId = "E123TEST";
});

afterEach(() => {
  envs.aws.cloudfrontDistributionId = originalDistributionId;
  vi.restoreAllMocks();
});

describe("invalidatePaths", () => {
  it("sends a CreateInvalidationCommand with /-prefixed, de-duplicated paths", async () => {
    cfMock.on(CreateInvalidationCommand).resolves({});

    await invalidatePaths(["brands/acme.png", "/brands/acme.png", null]);

    const calls = cfMock.commandCalls(CreateInvalidationCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.DistributionId).toBe("E123TEST");
    expect(input.InvalidationBatch.Paths).toEqual({
      Quantity: 1,
      Items: ["/brands/acme.png"],
    });
  });

  it("is a no-op when no distribution id is configured", async () => {
    envs.aws.cloudfrontDistributionId = "";
    await invalidatePaths(["brands/acme.png"]);
    expect(cfMock.commandCalls(CreateInvalidationCommand)).toHaveLength(0);
  });

  it("swallows CloudFront errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    cfMock.on(CreateInvalidationCommand).rejects(new Error("AccessDenied"));
    await expect(invalidatePaths(["brands/acme.png"])).resolves.toBeNull();
  });
});
