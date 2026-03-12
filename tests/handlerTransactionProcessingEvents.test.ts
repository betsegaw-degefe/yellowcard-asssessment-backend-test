import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { SQSEvent, SQSRecord } from "aws-lambda";

const mockSend = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule("../src/shared", () => ({
  ddbDoc: {
    send: mockSend,
  },
  TABLE_NAME: "transactions",
  TransactionStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
  TransactionMessage: {},
}));

const { handler } = await import("../src/handlerTransactionProcessingEvents");

function createSQSEvent(messages: object[]): SQSEvent {
  return {
    Records: messages.map((msg, index) => ({
      messageId: `msg-${index}`,
      receiptHandle: `receipt-${index}`,
      body: JSON.stringify(msg),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: Date.now().toString(),
        SenderId: "test",
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody: "test",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:TransactionProcessingEventsQueue",
      awsRegion: "us-east-1",
    })) as SQSRecord[],
  };
}

describe("handlerTransactionProcessingEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("amount starting with even number -> COMPLETED", () => {
    it("should mark transaction as COMPLETED when amount starts with 2", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 200,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("COMPLETED");
    });

    it("should mark transaction as COMPLETED when amount starts with 4", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 456,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("COMPLETED");
    });

    it("should mark transaction as COMPLETED when amount starts with 6", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 678,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("COMPLETED");
    });

    it("should mark transaction as COMPLETED when amount starts with 8", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 890,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("COMPLETED");
    });

    it("should mark transaction as COMPLETED when amount starts with 0", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 0.50,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("COMPLETED");
    });
  });

  describe("amount starting with odd number -> FAILED", () => {
    it("should mark transaction as FAILED when amount starts with 1", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 100,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("FAILED");
    });

    it("should mark transaction as FAILED when amount starts with 3", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 350,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("FAILED");
    });

    it("should mark transaction as FAILED when amount starts with 5", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 500,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("FAILED");
    });

    it("should mark transaction as FAILED when amount starts with 7", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 789,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("FAILED");
    });

    it("should mark transaction as FAILED when amount starts with 9", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 999,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ExpressionAttributeValues[":newStatus"]).toBe("FAILED");
    });
  });

  describe("conditional update failure", () => {
    it("should handle ConditionalCheckFailedException gracefully", async () => {
      const error = new ConditionalCheckFailedException({
        message: "The conditional request failed",
        $metadata: {},
      });
      mockSend.mockRejectedValueOnce(error);

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 200,
          reference: "ref-123",
        },
      ]);

      await expect(handler(event)).resolves.not.toThrow();
    });

    it("should continue processing other messages after conditional failure", async () => {
      const error = new ConditionalCheckFailedException({
        message: "The conditional request failed",
        $metadata: {},
      });
      mockSend.mockRejectedValueOnce(error);
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        { id: "tx-1", status: "PROCESSING", amount: 200, reference: "ref-1" },
        { id: "tx-2", status: "PROCESSING", amount: 400, reference: "ref-2" },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("DynamoDB error handling", () => {
    it("should throw on unexpected DynamoDB errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("DynamoDB connection failed"));

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 200,
          reference: "ref-123",
        },
      ]);

      await expect(handler(event)).rejects.toThrow("DynamoDB connection failed");
    });
  });

  describe("missing id handling", () => {
    it("should skip messages without id", async () => {
      const event = createSQSEvent([
        { status: "PROCESSING", amount: 200, reference: "ref-123" },
      ]);

      await handler(event);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("conditional expression validation", () => {
    it("should use correct condition expression for PROCESSING status", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PROCESSING",
          amount: 200,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          ConditionExpression: string;
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.ConditionExpression).toBe("#status = :processing");
      expect(updateCommand.input.ExpressionAttributeValues[":processing"]).toBe("PROCESSING");
    });
  });
});
