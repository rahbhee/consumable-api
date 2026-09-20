SELECT identifier, route, count, "windowStart" FROM rate_limit_hits WHERE route='api' ORDER BY "windowStart" DESC LIMIT 5;
