# Import Finviz.com Futures to Microprediction

This module imports various futures prices to Microprediction.org.

## Implementation Details

There is a single Lambda function that is run as a scheduled
CloudWatch Event every minute pull new data. This function
is created using webpack to amalgamate the various imported modules.

It runs in about 2 seconds or less every minute.

The write keys are not included in this repo.
