# RTAIP Responsible-Use & Ethics Policy

RTAIP delivers a "see everything" *situational-awareness experience* **using
only public or explicitly authorized data**. This document is a hard product
boundary, not a suggestion.

## Permitted
- Aggregating and correlating **publicly available** information (certificate
  transparency, public DNS, open corporate registries, public threat-intel
  feeds, public social posts within each platform's API Terms).
- Fusing **open geospatial feeds** (NOAA, USGS, NASA EONET, ADS-B/AIS, GDELT).
- Assessing assets you **own or are explicitly authorized** to assess
  (attack-surface, brand/impersonation monitoring, threat intelligence).
- Maintaining **provenance** on every datapoint and an **audit log** of access.

## Prohibited
- Real-time tracking or geolocation of **specific private individuals**.
- Facial- or voice-recognition surveillance of individuals.
- Accessing cameras, phones, accounts, or devices **without authorization**.
- Deanonymizing, doxxing, stalking, or harassing people.
- Scraping or ingesting data in violation of a source's Terms of Service, or
  bypassing authentication / access controls.
- Purchasing or ingesting illegally obtained or non-consensual personal data.

## How it is enforced
- Connectors are reviewed against this policy before merge (see CONTRIBUTING.md).
- Every record carries a `source`, timestamp, and confidence for provenance.
- Access is recorded in `audit_logs`; consent is recorded in `consent_logs`.
- Reports of misuse: see SECURITY.md.

> If a feature's primary purpose is to surveil a person rather than analyze
> public information or authorized assets, it does not belong in RTAIP.
