import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { APIGatewayProxyEvent } from "aws-lambda";

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

const { handler } = await import("../src/getTransaction");

function createEvent(id: string | undefined): Partial<APIGatewayProxyEvent> {
  return {
    pathParameters: id ? { id } : undefined,
    path: id ? `/transactions/${id}` : "/transactions/",
    httpMethod: "GET",
    headers: {
      "content-type": "application/json",
    },
    requestContext: {
      accountId: "000000000000",
      apiId: "test",
      authorizer: null,
      protocol: "HTTP/1.1",
      httpMethod: "GET",
      identity: {
        sourceIp: "127.0.0.1",
        userAgent: "test",
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        user: null,
        userArn: null,
      },
      path: `/transactions/${id}`,
      stage: "local",
      requestId: "test-request-id",
      requestTimeEpoch: Date.now(),
      resourceId: "test",
      resourcePath: "/transactions/{id}",
    },
  };
}

describe("getTransaction handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful retrieval", () => {
    it("should return HTTP 200 with transaction details", async () => {
      const mockTransaction = {
        id: "3f9f9e28-6a8c-4a10-9a44-3e7b24e4d991",
        reference: "external-tx-123",
        amount: 100,
        currency: "USD",
        status: "PENDING",
        createdAt: "2026-03-12T18:30:00Z",
        updatedAt: "2026-03-12T18:30:00Z",
      };

      mockSend.mockResolvedValueOnce({ Item: mockTransaction });

      const event = createEvent("3f9f9e28-6a8c-4a10-9a44-3e7b24e4d991");
      const response = await handler(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.id).toBe(mockTransaction.id);
      expect(body.reference).toBe(mockTransaction.reference);
      expect(body.amount).toBe(mockTransaction.amount);
      expect(body.currency).toBe(mockTransaction.currency);
      expect(body.status).toBe(mockTransaction.status);
      expect(body.createdAt).toBe(mockTransaction.createdAt);
      expect(body.updatedAt).toBe(mockTransaction.updatedAt);
    });
  });

  describe("transaction not found", () => {
    it("should return HTTP 404 when transaction does not exist", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent("non-existent-id");
      const response = await handler(event);

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("NotFound");
      expect(body.message).toBe("Transaction not found");
    });
  });

  describe("missing id", () => {
    it("should return HTTP 400 when id is missing", async () => {
      const event = createEvent(undefined);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.message).toBe("Missing or invalid transaction id");
    });

    it("should return HTTP 400 when id is empty string", async () => {
      const event = {
        ...createEvent(undefined),
        pathParameters: { id: "" },
      };
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.message).toBe("Missing or invalid transaction id");
    });

    it("should return HTTP 400 when id is whitespace only", async () => {
      const event = {
        ...createEvent(undefined),
        pathParameters: { id: "   " },
      };
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("ValidationError");
      expect(body.message).toBe("Missing or invalid transaction id");
    });
  });

  describe("unexpected errors", () => {
    it("should return HTTP 500 when DynamoDB throws an error", async () => {
      mockSend.mockRejectedValueOnce(new Error("DynamoDB connection failed"));

      const event = createEvent("3f9f9e28-6a8c-4a10-9a44-3e7b24e4d991");
      const response = await handler(event);

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body.error).toBe("InternalError");
      expect(body.message).toBe("An unexpected error occurred");
    });
  });
});
