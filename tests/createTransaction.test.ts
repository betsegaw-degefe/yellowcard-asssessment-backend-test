import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockSend = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule("../src/shared", () => ({
  ddbDoc: {
    send: mockSend,
  },
  TABLE_NAME: "transactions",
  json: (statusCode: number, body: unknown) => ({
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-idempotency-key",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  }),
}));

const { handler } = await import("../src/createTransaction");

function createEvent(body: object | null): APIGatewayProxyEventV2 {
  return {
    body: body ? JSON.stringify(body) : null,
    rawPath: "/transactions",
    rawQueryString: "",
    requestContext: {
      http: {
        method: "POST",
        path: "/transactions",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      accountId: "000000000000",
      apiId: "test",
      domainName: "localhost",
      domainPrefix: "localhost",
      requestId: "test-request-id",
      routeKey: "POST /transactions",
      stage: "local",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    headers: {
      "content-type": "application/json",
    },
    isBase64Encoded: false,
    routeKey: "POST /transactions",
    version: "2.0",
  } as APIGatewayProxyEventV2;
}

describe("createTransaction handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful transaction creation", () => {
    it("should return HTTP 201 with transaction details", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createEvent({
        amount: 100,
        currency: "USD",
        reference: "external-tx-123",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.status).toBe("PENDING");
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it("should default currency to USD when not provided", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createEvent({
        amount: 50,
        reference: "external-tx-456",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const putCommandArg = (mockSend.mock.calls as unknown[][])[0]?.[0] as { input: { Item: { currency: string } } };
      expect(putCommandArg?.input?.Item?.currency).toBe("USD");
    });

    it("should generate deterministic UUID from reference", async () => {
      mockSend.mockResolvedValueOnce({});

      const event1 = createEvent({
        amount: 100,
        reference: "same-reference",
      });

      const response1 = await handler(event1);
      const body1 = JSON.parse(response1.body);

      mockSend.mockResolvedValueOnce({});

      const event2 = createEvent({
        amount: 200,
        reference: "same-reference",
      });

      const response2 = await handler(event2);
      const body2 = JSON.parse(response2.body);

      expect(body1.id).toBe(body2.id);
    });
  });

  describe("validation errors", () => {
    it("should return HTTP 400 when amount is missing", async () => {
      const event = createEvent({
        currency: "USD",
        reference: "external-tx-123",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.details).toContainEqual({
        field: "amount",
        message: "amount is required",
      });
    });

    it("should return HTTP 400 when reference is missing", async () => {
      const event = createEvent({
        amount: 100,
        currency: "USD",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.details).toContainEqual({
        field: "reference",
        message: "reference is required",
      });
    });

    it("should return HTTP 400 when amount is negative", async () => {
      const event = createEvent({
        amount: -50,
        currency: "USD",
        reference: "external-tx-123",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.details).toContainEqual({
        field: "amount",
        message: "amount must be a positive number",
      });
    });

    it("should return HTTP 400 when body is null", async () => {
      const event = createEvent(null);

      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
    });

    it("should return HTTP 400 when body is invalid JSON", async () => {
      const event = {
        ...createEvent(null),
        body: "invalid-json",
      } as APIGatewayProxyEventV2;

      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("InvalidJSON");
    });
  });

  describe("duplicate transaction", () => {
    it("should return HTTP 409 when transaction already exists", async () => {
      const error = new ConditionalCheckFailedException({
        message: "The conditional request failed",
        $metadata: {},
      });
      mockSend.mockRejectedValueOnce(error);

      const event = createEvent({
        amount: 100,
        currency: "USD",
        reference: "duplicate-tx-123",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(409);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("Conflict");
      expect(body.message).toBe("Transaction already exists");
    });
  });

  describe("unexpected errors", () => {
    it("should return HTTP 500 when DynamoDB throws generic error", async () => {
      mockSend.mockRejectedValueOnce(new Error("DynamoDB connection failed"));

      const event = createEvent({
        amount: 100,
        currency: "USD",
        reference: "external-tx-123",
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("InternalError");
      expect(body.message).toBe("An unexpected error occurred");
    });
  });
});
