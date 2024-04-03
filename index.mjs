'use strict';

import * as Hapi from '@hapi/hapi';
import * as Sentry from '@sentry/node';
import * as fs from 'node:fs';
import {exec} from 'child_process';

const DSN = process.env.SENTRY_DSN;
const TEST_NAME = process.argv[2];
const LOG_COUNT = 4;

// Sanity checks
if (/sync|async|async-context/.test(TEST_NAME) === false) {
    throw new Error(`Please provide a valid test name as the first argument. e.g. node index.js sync. Options are: sync, async, async-context. Received ${TEST_NAME}`)
}
if (!DSN) {
    throw new Error('Please provide a sentry DSN via process.env.SENTRY_DSN')
}

// Clean up any previous testing data
fs.rmSync(`debug.${TEST_NAME}.json`, {
    force: true,
});

let server = undefined;
const init = async () => {

    server = Hapi.server({
        port: 3000,
        host: 'localhost'
    });

    /**
     * Sentry Initialization. Note that Sentry.Integrations.Hapi is being added.
     */
    Sentry.init({
        env: 'local',
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
        integrations: [
          new Sentry.Integrations.Hapi({server}),
        ],
        beforeSend(event) {
            // Logging to disk so as not generate any extra breadcrumbs
            fs.appendFileSync(`debug.${TEST_NAME}.json`, JSON.stringify({event}, null, ' ') + '\n');
            return event;
        },
      });



    /**
     * Typical routes (no async handlers)
     */
    server.route({
        method: 'GET',
        path: '/sync/boom/foo',
        handler: function (request, h) {
            for(let i=0; i < LOG_COUNT; i++) {
                console.log(`${request.path} - ${i}`)
            }
            throw new Error('BOOM /sync/boom/foo')
        }
    });
    server.route({
        method: 'GET',
        path: '/sync/boom/bar',
        handler: function (request, h) {
            for(let i=0; i < LOG_COUNT; i++) {
                console.log(`${request.path} - ${i}`)
            }
            throw new Error('BOOM /sync/boom/bar')
        }
    });


    /**
      * Routes with async handlers
     */
    server.route({
        method: 'GET',
        path: '/async/boom/foo',
        handler: async function (request, h) {
            for(let i=0; i < LOG_COUNT; i++) {
                console.log(`${request.path} - ${i}`);
                await (new Promise((r) => setTimeout(r,100)));
            }
            throw new Error('BOOM /async/boom/foo')
        }
    });
    server.route({
        method: 'GET',
        path: '/async/boom/bar',
        handler: async function (request, h) {
            for(let i=0; i < LOG_COUNT; i++) {
                console.log(`${request.path} - ${i}`);
                await (new Promise((r) => setTimeout(r,100)));
            }
            throw new Error('BOOM /async/boom/bar')
        }
    });

    /**
     * Routes with async handlers wrapped with Sentry.runWithAsyncContext.
     *
     * Note, there is no analog to express middleware in Sentry. And this is
     * what Sentry.runWithAsyncContext is designed to work with. Hapi uses
     * a listener pattern, so this doesn't appear to be effective at isolating
     * an async operation.
     *
     * Here's a couple good discussions where other attempts at instrumentation
     * are running into a similar issue. The resolution is a bit unclear, but
     * seems like maybe they got it working...
     *
     * https://github.com/hapijs/hapi/issues/4049
     * https://github.com/openzipkin/zipkin-js/issues/483
     *
     */
    server.route({
        method: 'GET',
        path: '/async-context/boom/foo',
        handler: function (request, h) {
            return Sentry.runWithAsyncContext(async () => {
                for(let i=0; i < LOG_COUNT; i++) {
                    console.log(`${request.path} - ${i}`);
                    await (new Promise((r) => setTimeout(r,100)));
                }
                throw new Error('BOOM /async-context/boom/foo');
            });
        }
    });
    server.route({
        method: 'GET',
        path: '/async-context/boom/bar',
        handler: function (request, h) {
            return Sentry.runWithAsyncContext(async () => {
                for(let i=0; i < LOG_COUNT; i++) {
                    console.log(`${request.path} - ${i}`);
                    await (new Promise((r) => setTimeout(r,100)));
                }
                throw new Error('BOOM /async-context/boom/bar');
            });
        }
    });

    await server.start();
    console.log(`\n\nRunning Test: ${TEST_NAME}`)
    console.log(`Server running on ${server.info.uri}`);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

// Execute test
init().then(() => {

    // Create two parallel http requests
    exec(`curl -XGET localhost:3000/${TEST_NAME}/boom/foo & curl -XGET localhost:3000/${TEST_NAME}/boom/bar`);

    // Shut down the server after 3s. This should be ample time for requests to complete and sentry events
    // to be logged to disk.
    setTimeout(() => {
        server.stop();
        console.log(`
Test run for ${TEST_NAME} complete! Check debug.${TEST_NAME}.json to see sentry generated sentry events.
Note that state of tags and breadcrumbs contains data from other requests.
`)
    }, 3000);
})


