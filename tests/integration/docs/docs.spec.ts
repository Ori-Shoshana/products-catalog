import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import httpStatusCodes from 'http-status-codes';
import type { DependencyContainer } from 'tsyringe';
import type { DataSource } from 'typeorm';
import { getApp } from '@src/app';
import { SERVICES } from '@src/common/constants';
import { initConfig } from '@src/common/config';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;
  let container: DependencyContainer;
  let dataSource: DataSource;

  beforeAll(async function () {
    await initConfig(true);

    const [app, createdContainer] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    container = createdContainer;
    dataSource = container.resolve<DataSource>(SERVICES.DB_DATASOURCE);
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
