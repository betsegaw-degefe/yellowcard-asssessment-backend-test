import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { DynamoDBStreamEvent, DynamoDBRecord } from "aws-lambda";

const mockSend = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule("../src/shared", () => ({
  snsClient: {
    send: mockSend,
  },
  SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:000000000000:TRANSACTION-DB-UPDATES-TOPIC",
  TransactionStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
  TransactionMessage: {},
}));

jest.unstable_mockModule("@aws-sdk/client-sns", () => ({
  PublishCommand: jest.fn().mockImplementation((input) => input),
}));

const { handler } = await import("../src/streamPublisher");

function createDynamoDBStreamEvent(records: Partial<DynamoDBRecord>[]): DynamoDBStreamEvent {
  return {
    Records: records.map((record, index) => ({
      eventID: `event-${index}`,
      eventName: record.eventName ?? "INSERT",
      eventVersion: "1.1",
      eventSource: "aws:dynamodb",
      awsRegion: "us-east-1",
      dynamodb: record.dynamodb ?? {
        Keys: { id: { S: "tx-123" } },
        NewImage: {
          id: { S: "tx-123" },
          status: { S: "PENDING" },
          amount: { N: "100" },
          reference: { S: "ref-123" },
        },
        SequenceNumber: "123",
        SizeBytes: 100,
        StreamViewType: "NEW_IMAGE",
      },
      eventSourceARN: "arn:aws:dynamodb:us-east-1:000000000000:table/transactions/stream/2024-01-01T00:00:00.000",
    })) as DynamoDBRecord[],
  };
}

describe("streamPublisher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("stream_event_received", () => {
    it("should log stream event received for INSERT events", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              id: { S: "tx-123" },
              status: { S: "PENDING" },
              amount: { N: "100" },
              reference: { S: "ref-123" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("should log stream event received for MODIFY events", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-123" },
              status: { S: "PROCESSING" },
              amount: { N: "100" },
              reference: { S: "ref-123" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("event_published_to_sns", () => {
    it("should publish PENDING status events to SNS", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              id: { S: "tx-pending" },
              status: { S: "PENDING" },
              amount: { N: "200" },
              reference: { S: "ref-pending" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const publishCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        Message: string;
        MessageAttributes: Record<string, { DataType: string; StringValue: string }>;
      };

      const message = JSON.parse(publishCommand.Message);
      expect(message.id).toBe("tx-pending");
      expect(message.status).toBe("PENDING");
      expect(message.amount).toBe(200);
      expect(publishCommand.MessageAttributes.status.StringValue).toBe("PENDING");
    });

    it("should publish PROCESSING status events to SNS", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-processing" },
              status: { S: "PROCESSING" },
              amount: { N: "300" },
              reference: { S: "ref-processing" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const publishCommand = (mockSend.mock.calls as unknown[][])[0]?.[0] as {
        Message: string;
        MessageAttributes: Record<string, { DataType: string; StringValue: string }>;
      };

      const message = JSON.parse(publishCommand.Message);
      expect(message.id).toBe("tx-processing");
      expect(message.status).toBe("PROCESSING");
      expect(publishCommand.MessageAttributes.status.StringValue).toBe("PROCESSING");
    });
  });

  describe("status filtering", () => {
    it("should publish COMPLETED status events", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-completed" },
              status: { S: "COMPLETED" },
              amount: { N: "100" },
              reference: { S: "ref-completed" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("should publish FAILED status events", async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-failed" },
              status: { S: "FAILED" },
              amount: { N: "100" },
              reference: { S: "ref-failed" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("should NOT publish invalid status events", async () => {
      const event = createDynamoDBStreamEvent([
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-invalid" },
              status: { S: "INVALID_STATUS" },
              amount: { N: "100" },
              reference: { S: "ref-invalid" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("event type filtering", () => {
    it("should skip REMOVE events", async () => {
      const event = createDynamoDBStreamEvent([
        {
          eventName: "REMOVE",
          dynamodb: {
            Keys: { id: { S: "tx-123" } },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("missing NewImage", () => {
    it("should skip events without NewImage", async () => {
      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            Keys: { id: { S: "tx-123" } },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw on SNS publish error", async () => {
      mockSend.mockRejectedValueOnce(new Error("SNS publish failed"));

      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              id: { S: "tx-123" },
              status: { S: "PENDING" },
              amount: { N: "100" },
              reference: { S: "ref-123" },
            },
          },
        },
      ]);

      await expect(handler(event)).rejects.toThrow("SNS publish failed");
    });
  });

  describe("batch processing", () => {
    it("should process multiple records in batch", async () => {
      mockSend.mockResolvedValue({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              id: { S: "tx-1" },
              status: { S: "PENDING" },
              amount: { N: "100" },
              reference: { S: "ref-1" },
            },
          },
        },
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-2" },
              status: { S: "PROCESSING" },
              amount: { N: "200" },
              reference: { S: "ref-2" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should publish all valid statuses in mixed batch", async () => {
      mockSend.mockResolvedValue({});

      const event = createDynamoDBStreamEvent([
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              id: { S: "tx-1" },
              status: { S: "PENDING" },
              amount: { N: "100" },
              reference: { S: "ref-1" },
            },
          },
        },
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-2" },
              status: { S: "COMPLETED" },
              amount: { N: "200" },
              reference: { S: "ref-2" },
            },
          },
        },
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              id: { S: "tx-3" },
              status: { S: "PROCESSING" },
              amount: { N: "300" },
              reference: { S: "ref-3" },
            },
          },
        },
      ]);

      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });
});
