import { Handler } from "@netlify/functions";
import fetch from "cross-fetch";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET",
};

async function fetchJson<T>(url: string) {
  const data = await fetch(url);
  return data.json() as unknown as T;
}

export function validateParams({ spreadsheetId, sheet }: QueryParams) {
  if (!(spreadsheetId && sheet)) {
    throw new Error("spreadsheetId or sheet param is missing");
  }
}

function getRangeParams(value: string) {
  return value
    .split(",")
    .map((name) => `ranges=${name}&`)
    .join("");
}

async function fetchGoogleSheetData({ spreadsheetId, sheet }: QueryParams) {
  const rangesParams = getRangeParams(sheet);
  const data = await fetchJson<GoogleApiResult>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesParams}key=${GOOGLE_API_KEY}&majorDimension=ROWS`
  );
  return data;
}

interface QueryParams {
  spreadsheetId: string;
  sheet: string;
}

type GoogleSheetValues = Array<string[]>;

interface GoogleApiValueRange {
  majorDimension: "ROWS" | "COLUMNS";
  range: string;
  values: GoogleSheetValues;
}
interface GoogleApiResult {
  spreadsheetId: string;
  valueRanges: GoogleApiValueRange[];
}

function googleApiValueRangeToRowObjects(
  result: GoogleApiValueRange
): Array<Record<string, string | null>> {
  if (!result.values?.length) throw new Error("No data available");

  if (result.majorDimension === "ROWS") {
    const keys = result.values[0];
    const rows = result.values.slice(1, result.values.length);
    return rows.map((values) => {
      const object: Record<string, string | null> = {};
      keys.forEach((key, index) => (object[key] = values[index] ?? null));
      return object;
    });
  }
}

function valueRangesToObject(
  range: GoogleApiResult
): Record<string, Record<string, string>[]> {
  const object = {};
  range.valueRanges.forEach((valueRange) => {
    const key = valueRange.range.split("!")[0];
    object[key] = googleApiValueRangeToRowObjects(valueRange);
  });
  return object;
}

const handler: Handler = async (event, context) => {
  try {
    const params = event.queryStringParameters as unknown as QueryParams;
    validateParams(params);
    const data = await fetchGoogleSheetData(params);
    const result = valueRangesToObject(data);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers,
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error),
      headers,
    };
  }
};

export { handler };
