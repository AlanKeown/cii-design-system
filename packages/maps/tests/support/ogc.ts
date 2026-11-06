/** Small synthetic catalogues: no external services or imagery. */
export function wmsCapabilities(
  version: '1.1.1' | '1.3.0' = '1.3.0',
  endpoint = '/ogc/maps',
  codes = ['EPSG:4326', 'EPSG:3857', 'CRS:84']
): string {
  const tag = version === '1.3.0' ? 'CRS' : 'SRS';
  const root = version === '1.3.0' ? 'WMS_Capabilities' : 'WMT_MS_Capabilities';
  return `<?xml version="1.0"?><${root} version="${version}" xmlns:xlink="http://www.w3.org/1999/xlink"><Capability>
    <Request><GetMap><Format>image/png</Format><DCPType><HTTP><Get><OnlineResource xlink:href="${endpoint}"/></Get></HTTP></DCPType></GetMap></Request>
    <Layer><Title>Fixture</Title>${codes.map((code) => `<${tag}>${code}</${tag}>`).join('')}
      <Layer><Name>demo</Name><Title>Synthetic map</Title></Layer>
      <Layer><Name>second</Name><Title>Synthetic overlay</Title></Layer>
    </Layer></Capability></${root}>`;
}
export function wmtsCapabilities(
  options: {
    rest?: boolean;
    endpoint?: string;
    limits?: boolean;
    size?: number;
    maxZoom?: number;
  } = {}
): string {
  const {
    rest = false,
    endpoint = '/ogc/tiles',
    limits = false,
    size = 256
  } = options;
  return `<?xml version="1.0"?><Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0.0">
    <ows:OperationsMetadata><ows:Operation name="GetTile"><ows:DCP><ows:HTTP><ows:Get xlink:href="${endpoint}"><ows:Constraint name="GetEncoding"><ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues></ows:Constraint></ows:Get></ows:HTTP></ows:DCP></ows:Operation></ows:OperationsMetadata>
    <Contents><Layer><ows:Identifier>demo</ows:Identifier><Style isDefault="true"><ows:Identifier>normal</ows:Identifier></Style><Format>image/png</Format>
      <TileMatrixSetLink><TileMatrixSet>web</TileMatrixSet>${
        limits
          ? `<TileMatrixSetLimits>${Array.from(
              { length: (options.maxZoom ?? 4) + 1 },
              (_, z) => z
            )
              .map(
                (z) =>
                  `<TileMatrixLimits><TileMatrix>level-${z}</TileMatrix><MinTileRow>0</MinTileRow><MaxTileRow>0</MaxTileRow><MinTileCol>0</MinTileCol><MaxTileCol>0</MaxTileCol></TileMatrixLimits>`
              )
              .join('')}</TileMatrixSetLimits>`
          : ''
      }</TileMatrixSetLink>
      ${rest ? `<ResourceURL format="image/png" resourceType="tile" template="${endpoint}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/>` : ''}
    </Layer><TileMatrixSet><ows:Identifier>web</ows:Identifier><ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
    ${Array.from({ length: (options.maxZoom ?? 4) + 1 }, (_, z) => z)
      .map(
        (z) =>
          `<TileMatrix><ows:Identifier>level-${z}</ows:Identifier><ScaleDenominator>${((2 * Math.PI * 6378137) / 256 / 2 ** z / 0.00028).toPrecision(16)}</ScaleDenominator><TopLeftCorner>-20037508.342789244 20037508.342789244</TopLeftCorner><TileWidth>${size}</TileWidth><TileHeight>${size}</TileHeight><MatrixWidth>${2 ** z}</MatrixWidth><MatrixHeight>${2 ** z}</MatrixHeight></TileMatrix>`
      )
      .join('')}
    </TileMatrixSet></Contents></Capabilities>`;
}
