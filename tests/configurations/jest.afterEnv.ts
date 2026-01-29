import path from 'path';
import jestOpenAPI from 'jest-openapi';

jestOpenAPI(path.join(process.cwd(), 'openapi3.yaml'));
