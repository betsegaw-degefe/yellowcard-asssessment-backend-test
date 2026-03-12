import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { ddbDoc, TABLE_NAME, json } from "./shared";

export async function handler(event: APIGatewayProxyEvent | any) {
  const id = event?.pathParameters?.id ?? event?.pathParameters?.["id"];

  console.log("get_transaction_request_received", { id });

  if (!id || typeof id !== "string" || id.trim() === "") {
    return json(400, { error: "ValidationError", message: "Missing or invalid transaction id" });
  }

  try {
    console.log("get_transaction_dynamodb_get_attempt", { id });

    const result = await ddbDoc.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { id } })
    );

    if (!result.Item) {
      console.log("get_transaction_not_found", { id });
      return json(404, { error: "NotFound", message: "Transaction not found" });
    }

    console.log("get_transaction_success", { id, status: result.Item.status });

    return json(200, result.Item);
  } catch (err: unknown) {
    console.log("get_transaction_unexpected_error", { error: err });
    return json(500, { error: "InternalError", message: "An unexpected error occurred" });
  }
}
