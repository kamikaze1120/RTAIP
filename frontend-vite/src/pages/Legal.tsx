import React from 'react';
import { NewHeader } from '../components/NewHeader';

export default function LegalPage() {
  const ownership = 'Operated by Nexum Cloud';
  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <h1 className="text-3xl font-bold">Legal & Compliance</h1>
        <div className="mt-3 text-xs text-gray-300">{ownership}</div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Privacy Policy</div>
            <div className="mt-2 text-sm text-gray-200">
              We process public, unclassified data to provide decision support. We do not sell personal data. Minimal telemetry may be collected to secure and operate the service, including IP addresses and audit events. Users may request removal of their account information. Data is encrypted in transit and at rest where supported by infrastructure.
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Terms of Service</div>
            <div className="mt-2 text-sm text-gray-200">
              The platform is a decision support tool and does not replace operational judgment. Content is provided “as is” without warranties. Users must comply with applicable laws and organizational policies. Misuse, reverse engineering, or unauthorized access is prohibited. Service availability is not guaranteed.
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Cookie Notice</div>
            <div className="mt-2 text-sm text-gray-200">
              We use strictly necessary cookies/local storage to maintain session state, consent preferences, and configuration. No advertising cookies are used. You may clear storage to revoke consent and reconfigure preferences.
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Data Usage Disclosures</div>
            <div className="mt-2 text-sm text-gray-200">
              Sources include public datasets and open publications. Data is aggregated and analyzed to produce situational insights. Personal data, if incidentally observed in public sources, is not a processing target and may be redacted. Case artifacts (tags, annotations, comments) are scoped to authorized teams.
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Disclaimer</div>
            <div className="mt-2 text-sm text-gray-200">
              The platform operates on public data only and provides decision support. It is not a command-and-control system, and outputs should be validated by qualified personnel. Do not rely on the platform for life-critical actions without independent verification.
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="text-lg font-semibold">Audit & Retention</div>
            <div className="mt-2 text-sm text-gray-200">
              Critical actions are logged, retained per organizational policy, and are immutable at the application layer. Organizations can configure retention horizons to meet policy and legal requirements.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}