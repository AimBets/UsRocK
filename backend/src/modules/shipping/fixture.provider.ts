import { consolidatePackage, ShippingProviderError, type ShippingProvider } from "./shipping.provider.js";

/**
 * DEVELOPMENT ONLY (refused in production by env validation). Deterministic table so the
 * storefront can be built without carrier credentials. Quotes carry `provider: "fixture"` and
 * their names say "simulado"; they are not real freight prices.
 * CEP 99999999 simulates a provider outage; CEPs starting with 0 return no service.
 */
export function createFixtureShippingProvider(): ShippingProvider {
  return {
    name: "fixture",
    quote(request) {
      if (request.destinationPostalCode === "99999999") {
        return Promise.reject(new ShippingProviderError("unavailable", "Falha simulada do provedor de frete."));
      }
      if (request.destinationPostalCode.startsWith("0")) return Promise.resolve([]);
      const { weightGrams } = consolidatePackage(request.items);
      const extraKg = Math.max(0, Math.ceil(weightGrams / 1000) - 1);
      const region = Number(request.destinationPostalCode[0]);
      const distanceDays = region <= 3 ? 0 : region <= 6 ? 2 : 4;
      return Promise.resolve([
        { serviceId: "1", name: "PAC (simulado)", carrier: "Correios", priceMinor: 1990 + extraKg * 500 + distanceDays * 150, deliveryDaysMin: 5 + distanceDays, deliveryDaysMax: 8 + distanceDays },
        { serviceId: "2", name: "SEDEX (simulado)", carrier: "Correios", priceMinor: 3490 + extraKg * 800 + distanceDays * 250, deliveryDaysMin: 1 + distanceDays, deliveryDaysMax: 3 + distanceDays },
      ]);
    },
  };
}
