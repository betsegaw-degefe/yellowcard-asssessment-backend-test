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

const { handler } = await import("../src/handlerTransactionPendingEvents");

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
      eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:TransactionPendingEventsQueue",
      awsRegion: "us-east-1",
    })) as SQSRecord[],
  };
}

describe("handlerTransactionPendingEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful status update", () => {
    it("should update transaction status from PENDING to PROCESSING", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PENDING",
          amount: 100,
          reference: "ref-123",
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const updateCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        input: {
          Key: { id: string };
          UpdateExpression: string;
          ConditionExpression: string;
          ExpressionAttributeValues: Record<string, string>;
        };
      };

      expect(updateCommand.input.Key.id).toBe("tx-123");
      expect(updateCommand.input.ConditionExpression).toBe("#status = :pending");
      expect(updateCommand.input.ExpressionAttributeValues[":processing"]).toBe("PROCESSING");
    });

    it("should process multiple messages in batch", async () => {
      mockSend.mockResolvedValue({});

      const event = createSQSEvent([
        { id: "tx-1", status: "PENDING", amount: 100, reference: "ref-1" },
        { id: "tx-2", status: "PENDING", amount: 200, reference: "ref-2" },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("conditional update failure (duplicate message)", () => {
    it("should handle ConditionalCheckFailedException gracefully", async () => {
      const error = new ConditionalCheckFailedException({
        message: "The conditional request failed",
        $metadata: {},
      });
      mockSend.mockRejectedValueOnce(error);

      const event = createSQSEvent([
        {
          id: "tx-123",
          status: "PENDING",
          amount: 100,
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
        { id: "tx-1", status: "PENDING", amount: 100, reference: "ref-1" },
        { id: "tx-2", status: "PENDING", amount: 200, reference: "ref-2" },
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
          status: "PENDING",
          amount: 100,
          reference: "ref-123",
        },
      ]);

      await expect(handler(event)).rejects.toThrow("DynamoDB connection failed");
    });
  });

  describe("missing id handling", () => {
    it("should skip messages without id", async () => {
      const event = createSQSEvent([
        { status: "PENDING", amount: 100, reference: "ref-123" },
      ]);

      await handler(event);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
