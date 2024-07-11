'use strict'
/**
 * New Relic agent configuration.
 *
 * See lib/config/default.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
exports.config = {
  /**
   * Array of application names.
   */
  app_name: ['whk-recipe-routing'],
  /**
   * Your New Relic license key.
   */
  license_key: 'ff18d767d6018e15cd16e572614fef54FFFFNRAL',
  logging: {
    /**
     * Level at which to log. 'trace' is most useful to New Relic when diagnosing
     * issues with the agent, 'info' and higher will impose the least overhead on
     * production applications.
     */
    // enabled: true,
    level: 'info'
  },
  /**
   * When true, all request headers except for those listed in attributes.exclude
   * will be captured for all traces, unless otherwise specified in a destination's
   * attributes include/exclude lists.
   */
  allow_all_headers: true,
  // application_logging: {
  //   forwarding: {
  //     enabled: true
  //   }
  // },
  code_level_metrics: {
    enabled: true
  },
  security: {
    agent: {
      enabled: true,
    },
    enabled: true,
  },

  distributed_tracing: {
      enabled: true,
      // exclude_newrelic_header: false,
      // exclude_request_headers: ['cookie', 'x-api-key'],
      // exclude_response_headers: ['set-cookie', 'x-api-key']
  },
  attributes: {
    /**
     * Prefix of attributes to exclude from all destinations. Allows * as wildcard
     * at end.
     *
     * NOTE: If excluding headers, they must be in camelCase form to be filtered.
     *
     * @name NEW_RELIC_ATTRIBUTES_EXCLUDE
     */
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
