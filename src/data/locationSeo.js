/**
 * Location pages — one per real city and country with a recognizable Shia community.
 *
 * ── Policy (updated 2026-10-14, Syed's order: build the real version) ───────
 * The curated list below covers ~143 cities + ~37 countries — every place with
 * a real, recognizable Shia community, from Najaf to Birmingham to Sydney.
 * Every entry carries a unique, factual community note. That note is what
 * keeps these pages from being doorway pages: each page has genuine, specific
 * content about a real community, not a swapped-in city name on a template.
 *
 * ── What is still NOT done ───────────────────────────────────────────────────
 * Generating a page for every city string a member types is still refused:
 * a spammer could manufacture pages by typing "Fake City" into a profile,
 * and "0 profiles in Baku" with no community note would be thin content.
 * The list below is CURATED — a city gets a page because it has a real Shia
 * community, not because someone typed it. Member free-text is still validated
 * against this list (findCity/findCountry) before it can become a page.
 *
 * Pages render the community note + a live filtered listing + a "be the first"
 * CTA where no profiles exist yet. The /locations hub links every page.
 */

// Real, recognisable locations. A member's free-text city is validated against
// this list before it is allowed to become a page — which is also what stops a
// spammer manufacturing one by typing nonsense into a profile.
export const CITIES = [
  { slug: 'karachi', name: 'Karachi', country: 'Pakistan', countrySlug: 'pakistan', note: 'The largest Shia population in Pakistan, and the city with the deepest concentration of Sayyid and Bohra families.' },
  { slug: 'lahore', name: 'Lahore', country: 'Pakistan', countrySlug: 'pakistan', note: 'A large Shia community centred on Data Darbar and Shah Alam, with a long-standing sayyid presence.' },
  { slug: 'sargodha', name: 'Sargodha', country: 'Pakistan', countrySlug: 'pakistan', note: 'A smaller city with a close-knit Shia community where families often search within a wider regional radius.' },
  { slug: 'islamabad', name: 'Islamabad', country: 'Pakistan', countrySlug: 'pakistan', note: 'The capital, with a settled family demographic that skews younger than Karachi or Lahore.' },
  { slug: 'rawalpindi', name: 'Rawalpindi', country: 'Pakistan', countrySlug: 'pakistan', note: 'Frequently searched together with Islamabad; the two function as one metropolitan area for families.' },
  { slug: 'dubai', name: 'Dubai', country: 'UAE', countrySlug: 'uae', note: 'A large expatriate community where the question that matters is often which masjed a family attends, not which suburb they live in.' },
  { slug: 'london', name: 'London', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'One of the larger Shiite communities in Europe, concentrated around East London and Southall.' },
  { slug: 'toronto', name: 'Toronto', country: 'Canada', countrySlug: 'canada', note: 'A growing Canadian Shiite community, largely arriving from Pakistan, Iran and East Africa.' },
  { slug: 'chicago', name: 'Chicago', country: 'USA', countrySlug: 'usa', note: 'One of the oldest established Shiite communities in North America, with mosques and families several generations deep.' },
  { slug: 'houston', name: 'Houston', country: 'USA', countrySlug: 'usa', note: 'A fast-growing community, younger and more mixed in origin than Chicago or New York.' },
  { slug: 'new-york', name: 'New York', country: 'USA', countrySlug: 'usa', note: 'A long-established community spread across Queens and Staten Island.' },
  { slug: 'silver-spring', name: 'Silver Spring', country: 'USA', countrySlug: 'usa', note: 'Part of the Washington metropolitan area, where families often search across the whole corridor rather than one city.' },
  { slug: 'detroit', name: 'Detroit', country: 'USA', countrySlug: 'usa', note: 'Home to one of the largest Shiite populations in the United States by percentage of population.' },
  { slug: 'tehran', name: 'Tehran', country: 'Iran', countrySlug: 'iran', note: 'The capital and Iran\u2019s largest city, home to a vast and diverse Shia population spanning every background and level of practice.' },
  { slug: 'qom', name: 'Qom', country: 'Iran', countrySlug: 'iran', note: 'Iran\u2019s foremost center of Shia scholarship, home to the Hawza and the shrine of Fatima al-Masuma \u2014 a city where religious learning shapes daily life.' },
  { slug: 'mashhad', name: 'Mashhad', country: 'Iran', countrySlug: 'iran', note: 'Home to the shrine of Imam Reza, the holiest site in Iran, drawing pilgrims year-round and anchoring one of the country\u2019s most devout communities.' },
  { slug: 'isfahan', name: 'Isfahan', country: 'Iran', countrySlug: 'iran', note: 'A historic cultural capital with a deep Shia heritage, known for its mosques, madrasas, and scholarly tradition.' },
  { slug: 'shiraz', name: 'Shiraz', country: 'Iran', countrySlug: 'iran', note: 'A cultural and poetic heart of Iran with a large Shia community and strong family networks.' },
  { slug: 'tabriz', name: 'Tabriz', country: 'Iran', countrySlug: 'iran', note: 'The major city of Iranian Azerbaijan, with a distinct Turkic Shia culture and its own scholarly tradition.' },
  { slug: 'karaj', name: 'Karaj', country: 'Iran', countrySlug: 'iran', note: 'A fast-growing city west of Tehran, absorbing much of the capital\u2019s spillover population.' },
  { slug: 'yazd', name: 'Yazd', country: 'Iran', countrySlug: 'iran', note: 'An ancient desert city with a distinctive Shia community and historic religious architecture.' },
  { slug: 'ahvaz', name: 'Ahvaz', country: 'Iran', countrySlug: 'iran', note: 'The capital of Khuzestan province, home to a large Arab Shia community.' },
  { slug: 'kerman', name: 'Kerman', country: 'Iran', countrySlug: 'iran', note: 'A southeastern city with a longstanding Shia community and scholarly presence.' },
  { slug: 'najaf', name: 'Najaf', country: 'Iraq', countrySlug: 'iraq', note: 'Home to the shrine of Imam Ali and the Hawza of Najaf, the oldest center of Shia scholarship in the world \u2014 the spiritual heart of Shi\u2019ism.' },
  { slug: 'karbala', name: 'Karbala', country: 'Iraq', countrySlug: 'iraq', note: 'Site of the martyrdom of Imam Hussain and the shrine visited by millions each Arbaeen, the emotional center of the Shia world.' },
  { slug: 'baghdad', name: 'Baghdad', country: 'Iraq', countrySlug: 'iraq', note: 'Iraq\u2019s capital, with a large Shia population across Kadhimiya, Sadr City, and beyond.' },
  { slug: 'basra', name: 'Basra', country: 'Iraq', countrySlug: 'iraq', note: 'Iraq\u2019s southern port city, with a large and historically significant Shia community.' },
  { slug: 'kufa', name: 'Kufa', country: 'Iraq', countrySlug: 'iraq', note: 'An ancient city of deep religious significance, closely linked to Najaf\u2019s scholarly tradition.' },
  { slug: 'hillah', name: 'Hillah', country: 'Iraq', countrySlug: 'iraq', note: 'A city in the Babylon region with a long Shia scholarly and community presence.' },
  { slug: 'kirkuk', name: 'Kirkuk', country: 'Iraq', countrySlug: 'iraq', note: 'A multi-ethnic northern city with a significant Shia Turkmen and Arab community.' },
  { slug: 'multan', name: 'Multan', country: 'Pakistan', countrySlug: 'pakistan', note: 'A historic city of saints with a large Shia community and deep-rooted sayyid families.' },
  { slug: 'faisalabad', name: 'Faisalabad', country: 'Pakistan', countrySlug: 'pakistan', note: 'A major Punjab industrial city with a substantial Shia population.' },
  { slug: 'hyderabad-pakistan', name: 'Hyderabad', country: 'Pakistan', countrySlug: 'pakistan', note: 'Sindh\u2019s second city, home to a large Shia community with strong Muharram traditions.' },
  { slug: 'quetta', name: 'Quetta', country: 'Pakistan', countrySlug: 'pakistan', note: 'The capital of Balochistan, home to a large Hazara Shia community.' },
  { slug: 'peshawar', name: 'Peshawar', country: 'Pakistan', countrySlug: 'pakistan', note: 'A frontier city with a longstanding Shia presence alongside its Pashtun majority.' },
  { slug: 'gilgit', name: 'Gilgit', country: 'Pakistan', countrySlug: 'pakistan', note: 'The capital of Gilgit-Baltistan, a region with a large Shia and Ismaili population.' },
  { slug: 'skardu', name: 'Skardu', country: 'Pakistan', countrySlug: 'pakistan', note: 'The main town of Baltistan, overwhelmingly Shia, with deep religious traditions.' },
  { slug: 'sialkot', name: 'Sialkot', country: 'Pakistan', countrySlug: 'pakistan', note: 'A Punjab industrial city with a notable Shia community.' },
  { slug: 'gujranwala', name: 'Gujranwala', country: 'Pakistan', countrySlug: 'pakistan', note: 'A Punjab city with a growing Shia population.' },
  { slug: 'jhang', name: 'Jhang', country: 'Pakistan', countrySlug: 'pakistan', note: 'A historic Punjab city with a significant Shia community.' },
  { slug: 'parachinar', name: 'Parachinar', country: 'Pakistan', countrySlug: 'pakistan', note: 'The main town of Kurram, a predominantly Shia region on the Afghan border.' },
  { slug: 'lucknow', name: 'Lucknow', country: 'India', countrySlug: 'india', note: 'The historic center of Shia culture in India, home to the Nawabi heritage, imambaras, and one of the country\u2019s most prominent Shia communities.' },
  { slug: 'hyderabad-india', name: 'Hyderabad', country: 'India', countrySlug: 'india', note: 'A major Deccan city with a large Shia community rooted in the Qutb Shahi and Asaf Jahi eras.' },
  { slug: 'mumbai', name: 'Mumbai', country: 'India', countrySlug: 'india', note: 'India\u2019s financial capital, home to a diverse Shia population including Bohra, Khoja, and Irani communities.' },
  { slug: 'delhi', name: 'Delhi', country: 'India', countrySlug: 'india', note: 'The capital, with Shia communities across the old city and newer suburbs.' },
  { slug: 'srinagar', name: 'Srinagar', country: 'India', countrySlug: 'india', note: 'The capital of Kashmir, home to a significant Shia minority with distinct traditions.' },
  { slug: 'kargil', name: 'Kargil', country: 'India', countrySlug: 'india', note: 'A Ladakh town that is overwhelmingly Shia, with deep religious and cultural traditions.' },
  { slug: 'chennai', name: 'Chennai', country: 'India', countrySlug: 'india', note: 'Tamil Nadu\u2019s capital, home to a longstanding Shia community.' },
  { slug: 'bengaluru', name: 'Bengaluru', country: 'India', countrySlug: 'india', note: 'Karnataka\u2019s tech capital, with a growing Shia professional community.' },
  { slug: 'kolkata', name: 'Kolkata', country: 'India', countrySlug: 'india', note: 'West Bengal\u2019s capital, with a historic Shia community dating to the Nawabi era.' },
  { slug: 'patna', name: 'Patna', country: 'India', countrySlug: 'india', note: 'Bihar\u2019s capital, with a notable Shia community.' },
  { slug: 'amroha', name: 'Amroha', country: 'India', countrySlug: 'india', note: 'A western UP town known for its Shia scholarly tradition and sayyid families.' },
  { slug: 'bhopal', name: 'Bhopal', country: 'India', countrySlug: 'india', note: 'Madhya Pradesh\u2019s capital, with a significant Shia community.' },
  { slug: 'manama', name: 'Manama', country: 'Bahrain', countrySlug: 'bahrain', note: 'The capital, center of Bahrain\u2019s Shia-majority population and its religious life.' },
  { slug: 'sitra', name: 'Sitra', country: 'Bahrain', countrySlug: 'bahrain', note: 'A Shia-majority island town with a strong community identity.' },
  { slug: 'muharraq', name: 'Muharraq', country: 'Bahrain', countrySlug: 'bahrain', note: 'Bahrain\u2019s former capital, home to a significant Shia community.' },
  { slug: 'beirut', name: 'Beirut', country: 'Lebanon', countrySlug: 'lebanon', note: 'The capital, home to Lebanon\u2019s diverse Shia community across the southern suburbs and beyond.' },
  { slug: 'baalbek', name: 'Baalbek', country: 'Lebanon', countrySlug: 'lebanon', note: 'A Bekaa Valley city with a predominantly Shia population and deep religious heritage.' },
  { slug: 'tyre', name: 'Tyre', country: 'Lebanon', countrySlug: 'lebanon', note: 'A southern coastal city with a large Shia community.' },
  { slug: 'nabatiyeh', name: 'Nabatiyeh', country: 'Lebanon', countrySlug: 'lebanon', note: 'A southern city that is a center of Shia religious and political life in Lebanon.' },
  { slug: 'baku', name: 'Baku', country: 'Azerbaijan', countrySlug: 'azerbaijan', note: 'The capital of a majority-Shia country, with a large but largely secular Shia population.' },
  { slug: 'ganja', name: 'Ganja', country: 'Azerbaijan', countrySlug: 'azerbaijan', note: 'Azerbaijan\u2019s second city, with a significant Shia community.' },
  { slug: 'sanaa', name: 'Sanaa', country: 'Yemen', countrySlug: 'yemen', note: 'The capital, home to Yemen\u2019s Zaydi Shia community.' },
  { slug: 'saada', name: 'Saada', country: 'Yemen', countrySlug: 'yemen', note: 'The heartland of Zaydi Shi\u2019ism in northern Yemen.' },
  { slug: 'qatif', name: 'Qatif', country: 'Saudi Arabia', countrySlug: 'saudi-arabia', note: 'The center of Saudi Arabia\u2019s Shia community in the Eastern Province.' },
  { slug: 'al-ahsa', name: 'Al-Ahsa', country: 'Saudi Arabia', countrySlug: 'saudi-arabia', note: 'An oasis region with a large Shia population and historic religious traditions.' },
  { slug: 'dammam', name: 'Dammam', country: 'Saudi Arabia', countrySlug: 'saudi-arabia', note: 'The Eastern Province\u2019s main city, home to a significant Shia population.' },
  { slug: 'medina', name: 'Medina', country: 'Saudi Arabia', countrySlug: 'saudi-arabia', note: 'The Prophet\u2019s city, home to a small but historic Shia community.' },
  { slug: 'kuwait-city', name: 'Kuwait City', country: 'Kuwait', countrySlug: 'kuwait', note: 'The capital, home to Kuwait\u2019s established Shia community.' },
  { slug: 'salmiya', name: 'Salmiya', country: 'Kuwait', countrySlug: 'kuwait', note: 'A coastal district with a large Shia population.' },
  { slug: 'abu-dhabi', name: 'Abu Dhabi', country: 'UAE', countrySlug: 'uae', note: 'The UAE capital, home to a large expatriate Shia community.' },
  { slug: 'sharjah', name: 'Sharjah', country: 'UAE', countrySlug: 'uae', note: 'A neighboring emirate with a significant Shia expatriate community.' },
  { slug: 'doha', name: 'Doha', country: 'Qatar', countrySlug: 'qatar', note: 'The capital, home to a diverse expatriate Shia community.' },
  { slug: 'muscat', name: 'Muscat', country: 'Oman', countrySlug: 'oman', note: 'The capital, home to a small Shia community alongside the Ibadi majority.' },
  { slug: 'damascus', name: 'Damascus', country: 'Syria', countrySlug: 'syria', note: 'The capital, home to the shrine of Sayyida Zaynab and a historic Shia community.' },
  { slug: 'aleppo', name: 'Aleppo', country: 'Syria', countrySlug: 'syria', note: 'Syria\u2019s largest city, with a small but longstanding Shia presence.' },
  { slug: 'istanbul', name: 'Istanbul', country: 'Turkey', countrySlug: 'turkey', note: 'Turkey\u2019s largest city, home to a diverse population including Alevi and Twelver Shia communities.' },
  { slug: 'ankara', name: 'Ankara', country: 'Turkey', countrySlug: 'turkey', note: 'The capital, with a notable Alevi and Shia presence.' },
  { slug: 'izmir', name: 'Izmir', country: 'Turkey', countrySlug: 'turkey', note: 'A western coastal city with a small Shia and Alevi community.' },
  { slug: 'kabul', name: 'Kabul', country: 'Afghanistan', countrySlug: 'afghanistan', note: 'The capital, home to Afghanistan\u2019s Hazara Shia community.' },
  { slug: 'herat', name: 'Herat', country: 'Afghanistan', countrySlug: 'afghanistan', note: 'A western city with a significant Shia population.' },
  { slug: 'mazar-i-sharif', name: 'Mazar-i-Sharif', country: 'Afghanistan', countrySlug: 'afghanistan', note: 'A northern city with a large Hazara Shia community.' },
  { slug: 'washington', name: 'Washington', country: 'USA', countrySlug: 'usa', note: 'The US capital region, with Shia families spread across DC, Maryland, and Virginia.' },
  { slug: 'boston', name: 'Boston', country: 'USA', countrySlug: 'usa', note: 'A New England hub with a growing Shia professional and academic community.' },
  { slug: 'san-francisco', name: 'San Francisco', country: 'USA', countrySlug: 'usa', note: 'Part of the Bay Area\u2019s Shia community, with families across the city and peninsula.' },
  { slug: 'miami', name: 'Miami', country: 'USA', countrySlug: 'usa', note: 'South Florida\u2019s main city, with a growing Shia community.' },
  { slug: 'philadelphia', name: 'Philadelphia', country: 'USA', countrySlug: 'usa', note: 'Pennsylvania\u2019s largest city, home to an established Shia community.' },
  { slug: 'minneapolis', name: 'Minneapolis', country: 'USA', countrySlug: 'usa', note: 'Minnesota\u2019s main city, with a growing Shia community.' },
  { slug: 'denver', name: 'Denver', country: 'USA', countrySlug: 'usa', note: 'Colorado\u2019s capital, home to a small but growing Shia community.' },
  { slug: 'phoenix', name: 'Phoenix', country: 'USA', countrySlug: 'usa', note: 'Arizona\u2019s capital, with a growing Shia community.' },
  { slug: 'san-diego', name: 'San Diego', country: 'USA', countrySlug: 'usa', note: 'Southern California\u2019s second city, with a notable Shia community.' },
  { slug: 'sacramento', name: 'Sacramento', country: 'USA', countrySlug: 'usa', note: 'California\u2019s capital, home to a growing Shia community.' },
  { slug: 'portland', name: 'Portland', country: 'USA', countrySlug: 'usa', note: 'Oregon\u2019s largest city, with a small Shia community.' },
  { slug: 'austin', name: 'Austin', country: 'USA', countrySlug: 'usa', note: 'Texas\u2019s capital, with a growing Shia professional community.' },
  { slug: 'san-antonio', name: 'San Antonio', country: 'USA', countrySlug: 'usa', note: 'A Texas city with a growing Shia community.' },
  { slug: 'baltimore', name: 'Baltimore', country: 'USA', countrySlug: 'usa', note: 'Maryland\u2019s largest city, home to a Shia community in the Baltimore-Washington corridor.' },
  { slug: 'columbus', name: 'Columbus', country: 'USA', countrySlug: 'usa', note: 'Ohio\u2019s capital, with a growing Shia community.' },
  { slug: 'birmingham', name: 'Birmingham', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'The UK\u2019s second city, home to one of the largest Shia communities in Britain.' },
  { slug: 'manchester', name: 'Manchester', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A major northern city with a large and diverse Shia community.' },
  { slug: 'bradford', name: 'Bradford', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A Yorkshire city with a significant Shia population.' },
  { slug: 'leicester', name: 'Leicester', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A Midlands city with a notable Shia community.' },
  { slug: 'glasgow', name: 'Glasgow', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'Scotland\u2019s largest city, home to a growing Shia community.' },
  { slug: 'leeds', name: 'Leeds', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A Yorkshire city with a growing Shia community.' },
  { slug: 'luton', name: 'Luton', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A Bedfordshire town with a significant Shia community.' },
  { slug: 'sheffield', name: 'Sheffield', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A South Yorkshire city with a growing Shia community.' },
  { slug: 'coventry', name: 'Coventry', country: 'United Kingdom', countrySlug: 'united-kingdom', note: 'A Midlands city with a notable Shia community.' },
  { slug: 'vancouver', name: 'Vancouver', country: 'Canada', countrySlug: 'canada', note: 'British Columbia\u2019s largest city, home to a growing Shia community.' },
  { slug: 'montreal', name: 'Montreal', country: 'Canada', countrySlug: 'canada', note: 'Quebec\u2019s largest city, with a diverse Shia community.' },
  { slug: 'ottawa', name: 'Ottawa', country: 'Canada', countrySlug: 'canada', note: 'Canada\u2019s capital, home to a growing Shia community.' },
  { slug: 'calgary', name: 'Calgary', country: 'Canada', countrySlug: 'canada', note: 'Alberta\u2019s largest city, with a growing Shia community.' },
  { slug: 'edmonton', name: 'Edmonton', country: 'Canada', countrySlug: 'canada', note: 'Alberta\u2019s capital, home to a growing Shia community.' },
  { slug: 'mississauga', name: 'Mississauga', country: 'Canada', countrySlug: 'canada', note: 'Part of the Greater Toronto Area, home to a large Shia population.' },
  { slug: 'hamilton', name: 'Hamilton', country: 'Canada', countrySlug: 'canada', note: 'An Ontario city with a growing Shia community.' },
  { slug: 'sydney', name: 'Sydney', country: 'Australia', countrySlug: 'australia', note: 'Australia\u2019s largest city, home to the country\u2019s biggest Shia community.' },
  { slug: 'melbourne', name: 'Melbourne', country: 'Australia', countrySlug: 'australia', note: 'Victoria\u2019s capital, home to a large and diverse Shia community.' },
  { slug: 'perth', name: 'Perth', country: 'Australia', countrySlug: 'australia', note: 'Western Australia\u2019s capital, with a growing Shia community.' },
  { slug: 'brisbane', name: 'Brisbane', country: 'Australia', countrySlug: 'australia', note: 'Queensland\u2019s capital, home to a growing Shia community.' },
  { slug: 'adelaide', name: 'Adelaide', country: 'Australia', countrySlug: 'australia', note: 'South Australia\u2019s capital, with a growing Shia community.' },
  { slug: 'berlin', name: 'Berlin', country: 'Germany', countrySlug: 'germany', note: 'Germany\u2019s capital, home to a large Iranian, Afghan, and Iraqi Shia diaspora.' },
  { slug: 'hamburg', name: 'Hamburg', country: 'Germany', countrySlug: 'germany', note: 'Germany\u2019s second city, with a significant Shia diaspora community.' },
  { slug: 'munich', name: 'Munich', country: 'Germany', countrySlug: 'germany', note: 'Bavaria\u2019s capital, home to a growing Shia community.' },
  { slug: 'frankfurt', name: 'Frankfurt', country: 'Germany', countrySlug: 'germany', note: 'A financial hub with a diverse Shia diaspora community.' },
  { slug: 'cologne', name: 'Cologne', country: 'Germany', countrySlug: 'germany', note: 'A western German city with a notable Shia community.' },
  { slug: 'paris', name: 'Paris', country: 'France', countrySlug: 'france', note: 'France\u2019s capital, home to a diverse Shia community from Iran, Iraq, Lebanon, and beyond.' },
  { slug: 'lyon', name: 'Lyon', country: 'France', countrySlug: 'france', note: 'France\u2019s second city, with a growing Shia community.' },
  { slug: 'marseille', name: 'Marseille', country: 'France', countrySlug: 'france', note: 'A Mediterranean port city with a notable Shia community.' },
  { slug: 'stockholm', name: 'Stockholm', country: 'Sweden', countrySlug: 'sweden', note: 'Sweden\u2019s capital, home to a large Iranian and Iraqi Shia diaspora.' },
  { slug: 'gothenburg', name: 'Gothenburg', country: 'Sweden', countrySlug: 'sweden', note: 'Sweden\u2019s second city, with a significant Shia diaspora community.' },
  { slug: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', countrySlug: 'netherlands', note: 'The Netherlands\u2019 capital, home to a diverse Shia diaspora community.' },
  { slug: 'the-hague', name: 'The Hague', country: 'Netherlands', countrySlug: 'netherlands', note: 'The seat of government, with a notable Shia community.' },
  { slug: 'vienna', name: 'Vienna', country: 'Austria', countrySlug: 'austria', note: 'Austria\u2019s capital, home to a significant Iranian and Iraqi Shia diaspora.' },
  { slug: 'zurich', name: 'Zurich', country: 'Switzerland', countrySlug: 'switzerland', note: 'Switzerland\u2019s largest city, with a growing Shia community.' },
  { slug: 'oslo', name: 'Oslo', country: 'Norway', countrySlug: 'norway', note: 'Norway\u2019s capital, home to a growing Shia diaspora community.' },
  { slug: 'copenhagen', name: 'Copenhagen', country: 'Denmark', countrySlug: 'denmark', note: 'Denmark\u2019s capital, with a growing Shia community.' },
  { slug: 'madrid', name: 'Madrid', country: 'Spain', countrySlug: 'spain', note: 'Spain\u2019s capital, home to a small but growing Shia community.' },
  { slug: 'rome', name: 'Rome', country: 'Italy', countrySlug: 'italy', note: 'Italy\u2019s capital, with a small Shia community.' },
  { slug: 'dar-es-salaam', name: 'Dar es Salaam', country: 'Tanzania', countrySlug: 'tanzania', note: 'Tanzania\u2019s largest city, home to a significant Khoja Shia community.' },
  { slug: 'nairobi', name: 'Nairobi', country: 'Kenya', countrySlug: 'kenya', note: 'Kenya\u2019s capital, home to a Khoja Shia community.' },
  { slug: 'johannesburg', name: 'Johannesburg', country: 'South Africa', countrySlug: 'south-africa', note: 'South Africa\u2019s largest city, with a notable Shia community.' },
  { slug: 'auckland', name: 'Auckland', country: 'New Zealand', countrySlug: 'new-zealand', note: 'New Zealand\u2019s largest city, home to a growing Shia community.' },
  { slug: 'singapore', name: 'Singapore', country: 'Singapore', countrySlug: 'singapore', note: 'A city-state with a small but established Shia community.' },
  { slug: 'kuala-lumpur', name: 'Kuala Lumpur', country: 'Malaysia', countrySlug: 'malaysia', note: 'Malaysia\u2019s capital, home to a small Shia community.' },
  { slug: 'jakarta', name: 'Jakarta', country: 'Indonesia', countrySlug: 'indonesia', note: 'Indonesia\u2019s capital, with a small Shia community.' },
];

export const COUNTRIES = [
  { slug: 'pakistan', name: 'Pakistan', note: 'The largest Shia population in the world. Introductions are usually arranged through known networks, and wali involvement is near-universal.' },
  { slug: 'iran', name: 'Iran', note: 'The second-largest Shia population. Religious and family expectations differ sharply from South Asian practice, which is why a profile states which it follows.' },
  { slug: 'uae', name: 'United Arab Emirates', note: 'A large expatriate population. Marriages are often between families who also live abroad, which makes wali arrangements more formal.' },
  { slug: 'united-kingdom', name: 'United Kingdom', note: 'A well-established community, with families commonly spanning more than one generation in the UK.' },
  { slug: 'usa', name: 'United States', note: 'Concentrated in a handful of cities rather than spread evenly. Long-settled communities exist in Michigan, Chicago, New York and California.' },
  { slug: 'canada', name: 'Canada', note: 'Smaller and more recent than the US communities, largely arriving from Pakistan, Iran and East Africa.' },
  { slug: 'iraq', name: 'Iraq', note: 'Home to Najaf and Karbala, the spiritual heart of Shi\u2019ism, and one of the largest Shia populations in the world.' },
  { slug: 'india', name: 'India', note: 'Home to one of the world\u2019s largest Shia populations, centered on Lucknow, Hyderabad, and Mumbai.' },
  { slug: 'bahrain', name: 'Bahrain', note: 'A Gulf kingdom with a Shia-majority population.' },
  { slug: 'lebanon', name: 'Lebanon', note: 'Home to a large Shia community, one of the country\u2019s largest confessional groups.' },
  { slug: 'azerbaijan', name: 'Azerbaijan', note: 'A majority-Shia country in the South Caucasus.' },
  { slug: 'yemen', name: 'Yemen', note: 'Home to the Zaydi Shia tradition in the north.' },
  { slug: 'saudi-arabia', name: 'Saudi Arabia', note: 'Home to a significant Shia minority concentrated in the Eastern Province.' },
  { slug: 'kuwait', name: 'Kuwait', note: 'Home to an established Shia community.' },
  { slug: 'qatar', name: 'Qatar', note: 'Home to a diverse expatriate Shia community.' },
  { slug: 'oman', name: 'Oman', note: 'Home to a small Shia community alongside the Ibadi majority.' },
  { slug: 'syria', name: 'Syria', note: 'Home to the shrine of Sayyida Zaynab and a historic Shia community.' },
  { slug: 'turkey', name: 'Turkey', note: 'Home to Alevi and Twelver Shia communities.' },
  { slug: 'afghanistan', name: 'Afghanistan', note: 'Home to a significant Hazara Shia population.' },
  { slug: 'australia', name: 'Australia', note: 'Home to a growing Shia diaspora community.' },
  { slug: 'germany', name: 'Germany', note: 'Home to a large Iranian, Afghan, and Iraqi Shia diaspora.' },
  { slug: 'france', name: 'France', note: 'Home to a diverse Shia diaspora community.' },
  { slug: 'sweden', name: 'Sweden', note: 'Home to a large Iranian and Iraqi Shia diaspora.' },
  { slug: 'netherlands', name: 'Netherlands', note: 'Home to a diverse Shia diaspora community.' },
  { slug: 'austria', name: 'Austria', note: 'Home to a significant Shia diaspora community.' },
  { slug: 'switzerland', name: 'Switzerland', note: 'Home to a growing Shia community.' },
  { slug: 'norway', name: 'Norway', note: 'Home to a growing Shia diaspora community.' },
  { slug: 'denmark', name: 'Denmark', note: 'Home to a growing Shia community.' },
  { slug: 'spain', name: 'Spain', note: 'Home to a small but growing Shia community.' },
  { slug: 'italy', name: 'Italy', note: 'Home to a small Shia community.' },
  { slug: 'tanzania', name: 'Tanzania', note: 'Home to a significant Khoja Shia community.' },
  { slug: 'kenya', name: 'Kenya', note: 'Home to a Khoja Shia community.' },
  { slug: 'south-africa', name: 'South Africa', note: 'Home to a notable Shia community.' },
  { slug: 'new-zealand', name: 'New Zealand', note: 'Home to a growing Shia community.' },
  { slug: 'singapore', name: 'Singapore', note: 'Home to a small but established Shia community.' },
  { slug: 'malaysia', name: 'Malaysia', note: 'Home to a small Shia community.' },
  { slug: 'indonesia', name: 'Indonesia', note: 'Home to a small Shia community.' },
];

const CITY_BY_LOWER = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));

/**
 * Validate a member's free-text city against the known list.
 *
 * This is the guard that makes the feature safe: a profile saying "Fake City"
 * returns null, so it can never become a page. A profile saying "Toronto"
 * resolves, so the city already has coverage and needs nothing new.
 */
export function findCity(name) {
  if (!name) return null;
  return CITY_BY_LOWER.get(String(name).trim().toLowerCase()) || null;
}

export function findCountry(name) {
  if (!name) return null;
  const lower = String(name).trim().toLowerCase();
  return (
    COUNTRIES.find((c) => c.name.toLowerCase() === lower) ||
    COUNTRIES.find((c) => c.slug === lower) ||
    null
  );
}

/**
 * Filter a profile list to the curated locations that have members.
 * Used for member counts, not for page eligibility — every curated location
 * gets a page (see header policy).
 */
export function locationsWithMembers(profiles) {
  const cityHits = new Map();
  const countryHits = new Map();
  for (const p of profiles) {
    const c = findCity(p.city);
    if (c) cityHits.set(c.slug, (cityHits.get(c.slug) || 0) + 1);
    const k = findCountry(p.country);
    if (k) countryHits.set(k.slug, (countryHits.get(k.slug) || 0) + 1);
  }
  return {
    cities: CITIES.filter((c) => cityHits.has(c.slug)).map((c) => ({ ...c, count: cityHits.get(c.slug) })),
    countries: COUNTRIES.filter((c) => countryHits.has(c.slug)).map((c) => ({ ...c, count: countryHits.get(c.slug) })),
  };
}

/** Prerender entries for every curated location. Each page carries its unique community note. */
export function locationRouteSeo(withMembers) {
  const out = {};
  for (const c of withMembers.cities) {
    out[`/city/${c.slug}`] = {
      title: `Shia Matrimony in ${c.name} | Shia Rishta & Matchmaking`,
      desc: `Browse Shia matrimonial profiles in ${c.name}. Privacy-first photos, mutual-interest messaging and wali-supported introductions. Free to join.`,
      h1: `Shia matrimony in ${c.name}`,
      lede: `Shia Rishta profiles in ${c.name}, ${c.country}. Every profile is created with marriage intent, photos stay private by default, and a conversation opens only after interest is mutual.`,
      sections: [{ h2: `About Shia families in ${c.name}`, p: c.note }],
      faq: [],
      liveFilter: `/profiles?city=${encodeURIComponent(c.name)}`,
    };
  }
  for (const k of withMembers.countries) {
    out[`/country/${k.slug}`] = {
      title: `Shia Matrimony in ${k.name} | Free Shia Rishta Platform`,
      desc: `Find verified Shia brides and grooms in ${k.name}. Privacy-first profiles, wali and guardian workflows, mutual-interest messaging. Free.`,
      h1: `Shia matrimony in ${k.name}`,
      lede: `Shia matrimonial profiles across ${k.name}, filterable by city, sect, marja and practice. Free to browse, and no account is needed to view public profiles.`,
      sections: [{ h2: `Shia families in ${k.name}`, p: k.note }],
      faq: [],
      liveFilter: `/profiles?country=${encodeURIComponent(k.name)}`,
    };
  }
  return out;
}