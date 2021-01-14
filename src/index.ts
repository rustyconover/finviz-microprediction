// What this code does is download the latest load information and publishes to microprediction.org
import { MicroWriter, MicroWriterConfig } from "microprediction";
const bent = require("bent");

import * as AWS from "aws-sdk";
import * as qs from "querystring";
const getJSON = bent("json");
const getBuffer = bent("buffer");
import { ScheduledHandler } from "aws-lambda";

type FutureInfo = {
  name: string,
  last_update_time: number,
  last_volume: number,
  last_range: number,
  last_change: number,
  last_return: number,
};

async function getFuture(ticker: string): Promise<FutureInfo> {
  const quote_options = {
    ticker,
    instrument: "futures",
    timeframe: "i5",
    type: "new"
  };

  const json = await getJSON(`https://finviz.com/api/quote.ashx?${qs.encode(quote_options)}`);

  //  console.log(json);
  return {
    last_update_time: json.date[json.date.length - 1],
    last_volume: json.volume[json.volume.length - 1],
    last_range: json.lastHigh - json.lastLow,
    last_change: json.close[json.close.length - 1] - json.close[json.close.length - 2],
    last_return: Math.log(json.close[json.close.length - 1]) - Math.log(json.close[json.close.length - 2]),
    name: json.name,
  }
}



async function getFutures(): Promise<FutureInfo[]> {


  const futures_to_pull = [
    "YM",
    "NQ",
    "ES",
    "ER2",
    "NKD",
    "EX",
    "DY",
    "VX",
    "CL",
    "QA",
    "RB",
    "HO",
    "NG",
    "ZK",
    "ZB",
    "ZN",
    "ZF",
    "ZT",
    "CC",
    "CT",
    "JO",
    "KC",
    "LB",
    "SB",
    "GC",
    "SI",
    "PL",
    "HG",
    "PA",
    "LC",
    "FC",
    "LH",
    "ZC",
    "ZL",
    "ZM",
    "ZO",
    "ZR",
    "ZS",
    "ZW",
    "RS",
    "DX",
    "6E",
    "6J",
    "6B",
    "6C",
    "6S",
    "6A",
    "6N",
  ];

  const results = await Promise.all(futures_to_pull.map(getFuture));
  return results;
}

interface FinvizState {
  [name: string]: number
}
const s3 = new AWS.S3({ region: "us-east-1" });

async function getLastUpdate(): Promise<FinvizState | undefined> {
  try {
    const state = await s3.getObject({
      Bucket: 'microprediction-lambda',
      Key: 'finviz-state.json',
    }).promise();
    if (state.Body != null) {
      return JSON.parse(state.Body?.toString('utf8'));
    }
  } catch (e) {
    console.error(`Error retrieving state: ${e}`);
    return;
  }
}

async function setState(s: FinvizState) {
  await s3.putObject({
    Bucket: 'microprediction-lambda',
    Key: 'finviz-state.json',
    Body: JSON.stringify(s),
  }).promise();
}


async function pushFutures() {
  const last_update = await getLastUpdate();
  const futures = await getFutures();

  let futures_to_send = [];
  if (last_update == null) {
    futures_to_send = futures;
  } else {
    futures_to_send = futures.filter(record => {
      // @ts-ignore
      return last_update != null && (last_update[record.name] == null || last_update[record.name] !== record.last_update_time);
    });
  }

  console.log("Would send", futures_to_send.length, "records");


  const writes = [];

  const write_key = process.env["MICROPREDICTION_WRITE_KEY"];
  if (write_key == null) {
    throw new Error("No defined MICROPREDICTION_WRITE_KEY");
  }
  const config = await MicroWriterConfig.create({
    write_key,
  });
  const writer = new MicroWriter(config);

  for (const record of futures_to_send) {
    const clean_name = record.name.toLowerCase().replace(/ /g, "_")
      .replace(/&/g, '_')
      .replace(/,/g, "");
    console.log("Writing", clean_name);

    console.log(`${clean_name} change: ${record.last_change} range: ${record.last_range} volume: ${record.last_volume} return: ${record.last_return}`);

    writes.push(writer.set(`finance-futures-${clean_name}-change.json`, record.last_change));
    writes.push(writer.set(`finance-futures-${clean_name}-range.json`, record.last_range));
    writes.push(writer.set(`finance-futures-${clean_name}-volume.json`, record.last_volume));
    writes.push(writer.set(`finance-futures-${clean_name}-log-return.json`, record.last_return));

    try {
      await Promise.all(writes);
    } catch (e) {
      console.error(e);
    }
  }
  await setState(Object.fromEntries(futures.map(v => [v.name, v.last_update_time])));

}

export const handler: ScheduledHandler<any> = async (event) => {
  console.log("Fetching data");
  await Promise.all([pushFutures()]);
};

