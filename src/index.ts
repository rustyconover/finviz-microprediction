// What this code does is download the latest load information and publishes to microprediction.org
import { MicroWriter, MicroWriterConfig } from "microprediction";
import { stream_write_keys } from "./write-keys";
const bent = require("bent");

import * as _ from "lodash";
const getJSON = bent("json");
const getBuffer = bent("buffer");
import { ScheduledHandler } from "aws-lambda";
import moment from "moment-timezone";
import * as cheerio from "cheerio";

async function getFutures(): Promise<
  Array<{
    name: string,
    value: number
  }>
> {
  // The file is updated every five minutes.
  const html = await getBuffer("https://finviz.com/futures.ashx");
  const $ = cheerio.load(html.toString('utf8'));

  const script_tags = $('body > script')
    .map((i, x) => x.children[0]);

  const script_data = script_tags.get(1).data;
  const script_lines: string[] = script_data.split(/\n/).filter((v: string) => v.match(/(var groups|var tiles)/));

  //console.log(script_lines);

  //const group_line = JSON.parse(script_lines.filter(v => v.match(/var groups = (.*)/))[0].replace(/var groups = /, '').replace(/;$/, ''));

  const tiles_line = JSON.parse(script_lines.filter(v => v.match(/var tiles = (.*)/))[0].replace(/var tiles = /, '').replace(/;$/, ''));

  //console.log(group_line);
  //console.log(tiles_line);

  const result = Object.values(tiles_line).map((t: any) => {
    return {
      name: t.label,
      value: t.last
    };
  });

  //  console.log(result);
  return result;
}


async function pushFutures() {
  const futures = await getFutures();

  const writes = [];

  const write_key = process.env["MICROPREDICTION_WRITE_KEY"];
  if (write_key == null) {
    throw new Error("No defined MICROPREDICTION_WRITE_KEY");
  }
  const config = await MicroWriterConfig.create({
    write_key,
  });
  const writer = new MicroWriter(config);

  for (const { name, value } of futures) {
    const clean_name = name.toLowerCase().replace(/ /g, "_")
      .replace(/&/g, '_')
      .replace(/,/g, "");
    console.log("Writing", clean_name, value);
    writes.push(writer.set(`finviz-futures-${clean_name}.json`, value));
  }
  await Promise.all(writes);
}

export const handler: ScheduledHandler<any> = async (event) => {
  console.log("Fetching data");
  await Promise.all([pushFutures()]);
};

