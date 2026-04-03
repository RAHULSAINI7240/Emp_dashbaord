const browserLocation = globalThis.location;
const apiProtocol = browserLocation?.protocol === 'https:' ? 'https:' : 'http:';
const apiHostname = browserLocation?.hostname ?? 'localhost';

export const environment = {
  production: true,
  apiBaseUrl: `${apiProtocol}//${apiHostname}:3001/api`
};
