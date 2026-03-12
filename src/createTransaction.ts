import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v5 as uuidv5 } from "uuid";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ddbDoc, TABLE_NAME, json } from "./shared";

const NAMESPACE = "a5b1c9d2-4e6a-4a7c-bc1d-8c2f5a0b3d44";

const TransactionStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

interface CreateTransactionRequest {
  amount: number;
  currency?: string;
  reference: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(body: unknown): { data?: CreateTransactionRequest; errors?: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== "object") {
    return { errors: [{ field: "body", message: "Request body is required" }] };
  }

  const { amount, currency, reference } = body as Record<string, unknown>;

  if (amount === undefined || amount === null) {
    errors.push({ field: "amount", message: "amount is required" });
  } else if (typeof amount !== "number" || !Number.isFinite(amount)) {
    errors.push({ field: "amount", message: "amount must be a valid number" });
  } else if (amount <= 0) {
    errors.push({ field: "amount", message: "amount must be a positive number" });
  }

  if (reference === undefined || reference === null) {
    errors.push({ field: "reference", message: "reference is required" });
  } else if (typeof reference !== "string" || reference.trim() === "") {
    errors.push({ field: "reference", message: "reference must be a non-empty string" });
  }

  if (currency !== undefined && currency !== null) {
    if (typeof currency !== "string" || currency.trim() === "") {
      errors.push({ field: "currency", message: "currency must be a non-empty string" });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      amount: amount as number,
      currency: (currency as string) || "USD",
      reference: (reference as string).trim(),
    },
  };
}

export async function handler(event: APIGatewayProxyEventV2) {
  console.log("create_transaction_request_received", {
    path: event.rawPath,
    method: event.requestContext?.http?.method,
    body: event.body,
  });

  try {
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return json(400, { error: "InvalidJSON", message: "Request body must be valid JSON" });
    }

    const validation = validateRequest(body);
    if (validation.errors) {
      return json(400, { error: "ValidationError", details: validation.errors });
    }

    const { amount, currency, reference } = validation.data!;

    console.log("create_transaction_validation_passed", {
      amount,
      currency,
      reference,
    });

    const id = uuidv5(reference, NAMESPACE);

    console.log("create_transaction_id_generated", {
      reference,
      id,
    });

    const now = new Date().toISOString();

    const tx = {
      id,
      reference,
      amount,
      currency,
      status: TransactionStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    console.log("create_transaction_dynamodb_put_attempt", {
      transaction: tx,
    });

    await ddbDoc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: tx,
        ConditionExpression: "attribute_not_exists(id)",
      })
    );

    console.log("create_transaction_success", {
      id: tx.id,
      reference: tx.reference,
      status: tx.status,
    });

    return json(201, {
      id: tx.id,
      status: tx.status,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    });
  } catch (err: unknown) {
    if (err instanceof ConditionalCheckFailedException) {
      const body = event.body ? JSON.parse(event.body) : {};
      const reference = body.reference;
      const id = reference ? uuidv5(reference, NAMESPACE) : undefined;

      console.log("create_transaction_duplicate_detected", {
        reference,
        id,
      });

      return json(409, { error: "Conflict", message: "Transaction already exists" });
    }

    console.log("create_transaction_unexpected_error", {
      error: err,
    });

    return json(500, { error: "InternalError", message: "An unexpected error occurred" });
  }
}
