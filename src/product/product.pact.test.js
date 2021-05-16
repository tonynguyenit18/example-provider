require("dotenv").config();
const { Verifier } = require("@pact-foundation/pact");
const controller = require("./product.controller");
const Product = require("./product");

// Setup provider server to verify
const app = require("express")();
const authMiddleware = require("../middleware/auth.middleware");
app.use(authMiddleware);
app.use(require("./product.routes"));
const server = app.listen("8080");

describe("Pact Verification", () => {
  it("validates the expectations of ProductService", () => {
    const baseOpts = {
      logLevel: "INFO",
      providerBaseUrl: "http://localhost:8080",
      providerVersion: process.env.TRAVIS_COMMIT,
      providerVersionTags: process.env.TRAVIS_BRANCH
        ? [process.env.TRAVIS_BRANCH]
        : [],
    };

    // For builds triggered by a 'contract content changed' webhook,
    // just verify the changed pact. The URL will bave been passed in
    // from the webhook to the CI job.
    const pactChangedOpts = {
      pactUrls: [process.env.PACT_URL],
    };

    // For 'normal' provider builds, fetch `master` and `prod` pacts for this provider
    const fetchPactsDynamicallyOpts = {
      provider: "pactflow-example-provider",
      consumerVersionSelectors: [
        { tag: "new" },
        { tag: "master", latest: true },
        { tag: "qa", latest: true },
        { tag: "prod", latest: true },
      ], // the new way of specifying which pacts to verify
      pactBrokerUrl: process.env.PACT_BROKER_BASE_URL_LOCAL,
      pactBrokerUsername: process.env.PACT_BROKER_BASIC_AUTH_USERNAME,
      pactBrokerPassword: process.env.PACT_BROKER_BASIC_AUTH_PASSWORD,
      enablePending: true,
      includeWipPactsSince: "2021-01-01",
    };

    const stateHandlers = {
      // "products exists": () => {
      //   controller.repository.products = new Map([
      //     ["10", new Product("10", "CREDIT_CARD", "28 Degrees", "v1")],
      //   ]);
      // },
      // "products exist": () => {
      //   controller.repository.products = new Map([
      //     ["10", new Product("10", "CREDIT_CARD", "28 Degrees", "v1")],
      //   ]);
      // },
      // "a product with ID 10 exists": () => {
      //   controller.repository.products = new Map([
      //     ["10", new Product("10", "CREDIT_CARD", "28 Degrees", "v1")],
      //   ]);
      // },
      "a product with ID 11 does not exist": () => {
        controller.repository.products = new Map();
      },
    };

    const requestFilter = (req, res, next) => {
      if (!req.headers["authorization"]) {
        next();
        return;
      }
      req.headers["authorization"] = `Bearer ${new Date().toISOString()}`;
      next();
    };

    const opts = {
      ...baseOpts,
      ...(process.env.PACT_URL ? pactChangedOpts : fetchPactsDynamicallyOpts),
      stateHandlers: stateHandlers,
      publishVerificationResult: process.env.CI === "true",
      requestFilter: requestFilter,
    };

    return new Verifier(opts)
      .verifyProvider()
      .then((output) => {
        console.log("Pact Verification Complete!");
        console.log(output);
      })
      .finally(() => {
        server.close();
      });
  });
});
