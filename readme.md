# Sentry Hapi Integration Experiment

This repo is a quick experiment to isolate how Sentry behaves when the Hapi integration is added, as described
in the Sentry [release notes for 7.89.0](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#hapi-integration).

This project was started because we were seeing issues with our hapi server's sentry integration.
We had some custom logic in place that was supposedly working at one point, but in the past few months we began
observing the following issues:

 - Breadcrumbs getting mixed across requests
 - Transaction tag values being completely unrealistic / wrong

These issues appeared to worsen when async code was in play. Using [Sentry.runWithAsyncContext](https://docs.sentry.io/platforms/node/configuration/async-context/)
did not appear to work for hapi. It should be noted there is no direct analog to express middleware in hapi... It should also be noted that services we run that
use express do not appear to have the aforementioned issues.

# Setup requirements

1. Using node v20.11
2. Using latest version of npm
3. Run `yarn install`
4. Have added a SENTRY_DSN config to either the .env file or local environment. e.g `echo SENTRY_DSN=https://$SOMETHING@SOMETHING.ingest.sentry.io/$SOMETHING > .env`.

# Test Scenarios

Each test suite effectively does the following.

- Starts a hapi server
- Makes sure sentry is initialized
- Hits a subset of endpoints currently with curl calls, which will result in several console.log statements being invoked and an error being thrown.
- The Sentry.beforeSend `beforeSend` hook will then write the sentry events in their entirety to disk
- A summary of the key pieces of event data can extracted and displayed using the the npm summary script.

The test scenarios highlight different issues with the default integration. The issues are as follows:

1. For the case where route handlers contain no async code (ie `npm run test -- sync`), the breadcrumbs for the request that arrives at the server first are correct, however the breadcrumbs that arrives at the second are polluted with breadcrumbs from the first request.

2. For the case where route handlers contain async routines (ie `npm run test -- async`), the breadcrumbs for the requests are intermingled, and an even bigger issue is that transaction indicates both request were for the a single route, ie `/async/boom/bar`, when in fact the request when to two separate routes.

3. For the case where route handlers are wrapped with a Sentry.runWithAsyncContext (ie `npm run test -- async-context`), no relevant breadcrumbs are displayed, and transactions are again incorrect.

# Running test scenarios

To run all the tests and see a summary, execute: `npm run test-all`. This will run each test scenario (sync, async, and async-context), and create a
summary of the key sentry event data that may seem off or incorrect.

To target a specific test, you can run `npm run test $test_name` where test_name is either sync, async or async-context.

To generate a summary of sentry events you can run `npm summary -- $debug_file` where debug_file will be debug.sync.json, debug.async.json, or debug.async-context.json.




