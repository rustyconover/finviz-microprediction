# Import Finviz.com Futures to Microprediction

This module imports various futures prices to [Microprediction.org](https://microprediction.org).

## Implementation Details

There is a single Lambda function that is run as a scheduled
CloudWatch Event every minutes to pull new data. This function
is created using Webpack to amalgamate the various imported modules.
