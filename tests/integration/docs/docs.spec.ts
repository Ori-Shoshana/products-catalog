import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import httpStatusCodes from 'http-status-codes';
import type { DataSource } from 'typeorm';
import { getApp } from '@src/app';
import { SERVICES } from '@src/common/constants';
import { initConfig, getConfig } from '@src/common/config';
import { initDataSource } from '@src/common/db/dataSource';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;
  let dataSource: DataSource;

  beforeAll(async function () {
    await initConfig(true);
    const config = getConfig();
    dataSource = await initDataSource(config);

    const [app] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
        { token: SERVICES.DB_DATASOURCE, provider: { useValue: dataSource } },
      ],
      useChild: true,
    });

    requestSender = new DocsRequestSender(app);
  });

  afterAll(async function () {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('should return 200 status code and the resource', async function () {
    const response = await requestSender.getDocs();

    expect(response.status).toBe(httpStatusCodes.OK);
    expect(response.type).toBe('text/html');
  });

  it('should return 200 status code and the json spec', async function () {
    const response = await requestSender.getDocsJson();

    expect(response.status).toBe(httpStatusCodes.OK);
    expect(response.type).toBe('application/json');
    expect(response.body).toHaveProperty('openapi');
  });
});
