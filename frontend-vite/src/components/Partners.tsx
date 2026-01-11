import React from 'react';

const logos = [
  { src: 'https://www.nga.mil/SiteDesign/images/NGA_Logo.png', alt: 'NGA Tearline' },
  { src: 'https://discover.dtic.mil/wp-content/uploads/2020/10/dtic_logo_2020_11_24_v1.png', alt: 'DTIC' },
  { src: 'https://www.usace.army.mil/Portals/2/Users/121/31/2131/USACE-logo-color.png', alt: 'USACE Open Data' },
  { src: 'https://www.dla.mil/Portals/105/Images/DLA_Seal_2C_300.png?ver=2018-10-15-154352-520', alt: 'PUB LOG' },
  { src: 'https://www.esd.whs.mil/Portals/54/Images/DOD-Seals/DOD-Standard-Seal-Color-2020.png', alt: 'Defense Data' },
  { src: 'https://www.start.umd.edu/gtd/images/START_Color_Stacked_Logo.png', alt: 'Global Terrorism Database' },
];

const Partners: React.FC = () => {
  return (
    <div className="bg-gray-900 py-8">
      <div className="container mx-auto">
        <h2 className="text-center text-2xl font-bold text-white mb-6">Our Data Partners</h2>
        <div className="relative overflow-hidden">
          <div className="flex animate-scroll">
            {logos.concat(logos).map((logo, index) => (
              <div key={index} className="flex-shrink-0 mx-6">
                <img src={logo.src} alt={logo.alt} className="h-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Partners;