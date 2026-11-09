/**
 * Programmatic-SEO landing pages, merged into the prerender pass.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 * These 14 pages are the site's entire long-tail asset. Each already carried a
 * hand-written, per-page title and description in landingPageMeta.js — but they
 * were NOT prerendered. Every one served the HOMEPAGE's document, including its
 * canonical tag.
 *
 * That is the most damaging SEO defect on the site. A canonical pointing at
 * another URL is an instruction to index the page AS that other URL, so
 * /shia-nikah was explicitly telling Google it was the homepage. All 14 keyword
 * pages were switched off at the source, while still being advertised in the
 * sitemap — discoverable, and incapable of ranking.
 *
 * ── Why per-page copy, not a template ────────────────────────────────────────
 * The body text below is written per page. Generating fourteen pages from one
 * paragraph with a swapped-in city name is exactly the doorway-page pattern
 * Google scaled down in its March 2024 core update: thin, near-identical pages
 * whose only purpose is to rank for a location. The previous state — all
 * fourteen serving one identical document — was that same mistake in a worse
 * form.
 *
 * Titles and descriptions are NOT retyped here. They are read from
 * landingPageMeta.js at build time, so the runtime <Seo> component and the
 * prerenderer cannot drift apart.
 */
const LANDING_BODY = {
  'shia-nikah': {
    h1: 'Shia Nikah: the marriage contract, explained',
    sections: [
      {
        h2: 'What is nikah?',
        p: [
          'Nikah is the contract that makes a marriage valid in Islam. For Shia Muslims it is not a formality or a blessing on a relationship — it is the act itself. When the formula is spoken with intention and consent, two people become husband and wife. Everything else — the feast, the celebration, the photographs — comes after.',
          'This page explains what a Shia nikah is, what makes it valid, how it differs from Sunni practice, and how to find a verified Shia spouse for nikah.',
          'Marriage is among the most recommended acts in Islam. The Prophet (s.a.w.) is reported to have said, “Whosoever marries, he has protected half of his religion,” and “Whoever likes to follow my tradition, then [he should know that] marriage is of my tradition.” Imam al-Baqir (a.s.) is reported to have said that no institution has been created in Islam more favoured and dearer to Allah than wedlock.',
          'In Shia law, marriage is of two kinds: permanent and temporary. A permanent marriage has no fixed time limit. A temporary marriage (mut’ah) fixes a duration and a mahr in the contract. Both are real marriages under Shia fiqh, and both follow the same contract rules — formula, consent, and mahr — with the duration stated in the temporary case.',
          'The nikah is a contract, and like any contract it has conditions. Ayatollah Sistani’s Islamic Laws (Ruling 2389) sets out five conditions for the marriage contract to be valid. First, the formula must be said in Arabic, as a matter of obligatory precaution. If the man or woman cannot say it in Arabic, they may say it in another language, using words that convey the meaning of zawwajtu (I wed) and qabiltu (I accept). They do not need to appoint an agent in that case. Second, intention: the man and woman — or their agents — must intend to establish the marriage when they say the formula. Third, sanity and maturity: the person saying the formula must be sane, and if saying it for themselves, must be of the age of legal responsibility (baligh). Fourth, the parties must be specified: if agents or guardians say the formula, they must name or indicate the husband and wife. A formula that does not identify a particular person is invalid. Fifth, consent: both the man and the woman must consent to the marriage. If they appear to disapprove but it is known that in their hearts they consent, the contract is valid — and if a marriage is contracted without consent and both later consent, it becomes valid.',
        ],
      },
      {
        h2: 'The formula (sigha)',
        p: [
          'The formula is the heart of the nikah. For a permanent marriage, the woman says: “Zawwajtuka nafsi ’ala as-sidaq al-ma’lum” — I have made myself your wife on the agreed mahr. The man replies immediately: “Qabiltut tazwij” — I accept the marriage.',
          'The acceptance must follow without a long pause. The couple may recite the formula themselves, or they may appoint representatives (wakil) to recite it on their behalf. A woman may represent a man and a man may represent a woman. One representative may act for both spouses. A small mispronunciation does not invalidate the contract if the meaning is unchanged.',
        ],
      },
      {
        h2: 'Mahr: the bride’s right',
        p: [
          'The mahr is the marriage gift the husband gives the wife. It is agreed before the nikah and named in the contract, and it belongs to the bride alone. It is her absolute right — not a bride price, and not a payment to her family.',
          'There is no fixed amount. It can be symbolic, like a copy of the Quran, or substantial, like property or a sum of money. Many Shia families choose amounts with religious meaning: 14 gold coins for the Fourteen Infallibles, 313 coins for the companions of Imam Mahdi (a.s.), or the mahr of Sayyida Fatima (a.s.), which was 500 silver dirhams. What matters is that it is agreed, named, and understood by both sides before the contract is spoken.',
          'If no mahr is named in the contract, the permanent marriage is still valid. In that case, once the marriage is consummated, the wife is entitled to the mahr al-mithl — the customary mahr of women of her standing. The rule is different for a temporary marriage: if no mahr is named there, the contract is invalid, even if the omission was by mistake or forgetfulness. (Ayatollah Sistani, Islamic Laws, Ruling 2437.)',
        ],
      },
      {
        h2: 'The wali’s permission',
        p: [
          'The wali — the bride’s guardian, usually her father or paternal grandfather — plays a real role in a Shia nikah. Per Ayatollah Sistani’s Code of Practice for Muslims in the West, in marrying a virgin woman it is necessary to get the consent of her father or paternal grandfather if she is not independent, and it is precautionarily obligatory to seek their consent even if she is independent. A woman who has been married before does not need her guardian’s permission in the same way.',
          'In practice, the wali’s involvement starts well before the nikah — at the proposal stage, when the families first meet. The wali is part of the conversation, not an approver brought in at the end.',
        ],
      },
      {
        h2: 'Witnesses: the point most guides get wrong',
        p: [
          'Here is the single most misunderstood fact about Shia nikah, and the one most general wedding guides state incorrectly. In Shia fiqh, witnesses are not required for the nikah. Ayatollah Sistani’s Code of Practice states plainly: “There is no condition for the presence of witnesses during the solemnization of the marriage, just as the presence of a cleric is not a condition for the validity of the marriage.”',
          'Witnesses are required for divorce (talaq) in Shia law. That is the opposite of the Sunni position, where witnesses are required for the nikah and not for divorce. Many general guides — including the guide that currently ranks first for “shia marriage” — state that two witnesses must observe the contract. That is the Sunni rule, not the Shia one. A Shia nikah performed without witnesses, with the formula, consent, mahr, and (where required) the wali’s permission, is valid.',
          'Families still commonly have witnesses present, and there is nothing wrong with that. But it is custom and good practice, not a condition of validity.',
        ],
      },
      {
        h2: 'Who may marry whom',
        p: [
          'A Shia man may marry a Sunni woman. The famous verdict — held by Ayatollah Sistani, Ayatollah Makarem Shirazi, and the late Ayatollah Lankarani — is that it is permissible, provided there is no fear that the marriage will lead one to lose one’s faith.',
          'A Shia woman marrying a Sunni man is restricted. In Ayatollah Sistani’s view it is not permissible as a matter of obligatory precaution, because of the risk to her beliefs; other maraji treat it as disliked (makruh) rather than forbidden. A family in this situation should ask its own marja.',
          'Marriage to a non-Muslim. A Muslim man may not contract a permanent marriage with a woman who is not among the People of the Book. Temporary marriage with a woman of the People of the Book is permissible in Shia law, with conditions; Ayatollah Sistani treats even that with obligatory precaution.',
          'Forbidden relations. Marriage with close relatives (mahram) — mother, daughter, sister, aunts, nieces, stepmother, mother-in-law, and others named in the rulings — is forbidden, as is marriage to a woman who is already married or in her waiting period.',
          'Where a question is genuinely disputed, the right step is to ask a scholar who follows your marja, not to rely on a website.',
        ],
      },
      {
        h2: 'After the nikah',
        p: [
          'The nikah makes the marriage valid in religious law. In the UK, USA, and Canada, a couple also needs a civil marriage for the marriage to be recognised in law — the religious contract and the legal registration are separate things, and the requirements vary by country and state. Couples should check the civil requirements where they live and make sure the registration is done.',
          'The walima — the wedding feast — follows the nikah. Its form is a matter of family and culture, not of law: a sofreh aghd spread, a mangni, a hall dinner, or a small family gathering are all equally a walima.',
        ],
      },
      {
        h2: 'Finding a spouse for nikah',
        p: [
          'A nikah needs a spouse, and finding one is the part most families find hardest — particularly in the diaspora, where the local community is small and children move away. ShiaRishta exists for that search: verified Shia profiles from the UK, USA, and Canada, filtered by marja and practice, with photo and ID verification badges, family-led introductions with the wali involved from the start, and a free biodata maker families can share on WhatsApp.',
          'Joining is free. Browse profiles or create a free account to start.',
        ],
      },
    ],
    faq: [
      { q: 'What makes a Shia nikah valid?', a: 'The formula spoken with intention, the consent of both parties, the mahr agreed and named, and — where required — the wali’s permission. The formula should be in Arabic where possible. No cleric and no witnesses are required for validity in Shia fiqh.' },
      { q: 'Do I need witnesses for a Shia nikah?', a: 'No. Witnesses are not a condition for the nikah in Shia law. They are required for divorce, not for marriage. Many families still have witnesses present as a matter of custom.' },
      { q: 'Does a cleric need to perform the nikah?', a: 'No. The couple may recite the formula themselves or appoint representatives. A cleric is commonly present and is good practice, but is not a condition of validity.' },
      { q: 'What is the mahr, and how much should it be?', a: 'The mahr is the husband’s gift to the wife, agreed before the nikah and named in the contract. It is her absolute right. There is no fixed amount — symbolic or substantial, often chosen with religious significance (for example, the 500 silver dirhams of Sayyida Fatima). If no mahr is named, a permanent marriage is still valid and the wife is entitled to the mahr al-mithl once the marriage is consummated (Sistani, Ruling 2437).' },
      { q: 'Can a Shia man marry a Sunni woman?', a: 'Yes, per the famous verdict of Ayatollah Sistani, Ayatollah Makarem Shirazi, and others — provided there is no fear of losing one’s faith. A Shia woman marrying a Sunni man is restricted by obligatory precaution in Sistani’s view. Ask your own marja for your situation.' },
      { q: 'What is the difference between a Shia nikah and a Sunni nikah?', a: 'The core — contract, mahr, consent, formula — is the same. The differences: witnesses are not required for a Shia nikah but are for a Sunni one; witnesses are required for a Shia divorce but not for a Sunni one; and Shia law recognises temporary marriage (mut’ah) while Sunni law does not.' },
      { q: 'Is a nikah enough, or do I need a civil marriage too?', a: 'In the UK, USA, and Canada, the nikah is the religious marriage. For legal recognition — visas, inheritance, hospital rights — you also need a civil marriage registration. Check the requirements where you live.' },
    ],
  },

  'shia-nikah-guide': {
    h1: 'Shia Nikah: The Complete Guide to Shia Marriage',
    sections: [
      {
        h2: 'What nikah is',
        p: [
          'If you search for “Shia marriage” or “Shia nikah” online, the first result is a general wedding site. It is a good guide to the celebrations. It is also wrong on the law in at least one important place — it states that two witnesses must observe the contract. In Shia fiqh, they do not have to.',
          'This guide is written to be the accurate one: the nikah contract as Shia law understands it, the traditions that surround it, and the practical questions families actually ask. Where the sources disagree, it says so. Where a ruling depends on your marja, it says that too.',
          'Nikah is the contract that makes a marriage valid in Islam. It is not a blessing on a relationship, and it is not a ceremony that ratifies something already decided. It is the act that creates the marriage. When the formula is spoken with intention and consent, two people become husband and wife.',
          'Marriage is among the most recommended acts in Islam. The Prophet (s.a.w.) is reported to have said, “Whosoever marries, he has protected half of his religion,” and “Whoever likes to follow my tradition, then [he should know that] marriage is of my tradition.” Imam Muhammad al-Baqir (a.s.) is reported to have said that no institution has been created in Islam more favoured and dearer to Allah than wedlock. Marriage is obligatory for a person who fears falling into what is unlawful through remaining unmarried.',
          'In Shia law, marriage is of two kinds. A permanent marriage has no fixed time limit — it is the marriage most people mean when they say “nikah.” A temporary marriage (mut’ah) fixes a duration and a mahr in the contract itself. Both are real marriages under Shia fiqh, and both follow the same contract rules: formula, consent, and mahr, with the duration stated in the temporary case. Temporary marriage is a distinctively Shia part of the law — Sunni law does not recognise it — and a family should understand that it exists, even if it is not what they are seeking.',
        ],
      },
      {
        h2: 'The contract: the formula and its conditions',
        p: [
          'The nikah has a formula, the sigha. For a permanent marriage, the woman says: “Zawwajtuka nafsi ’ala as-sidaq al-ma’lum” — I have made myself your wife on the agreed mahr. The man replies immediately: “Qabiltut tazwij” — I accept the marriage. The acceptance must follow without a long pause. For a temporary marriage, the woman states the duration as well: “I give myself to you in marriage for the dowry of [x] for the time period of [x],” and the man replies the same way.',
          'Ayatollah Sistani’s Islamic Laws (Ruling 2389) sets out five conditions for the marriage contract to be valid. First, the formula must be said in Arabic, as a matter of obligatory precaution. If the man or woman cannot say it in Arabic, they may say it in another language, using words that convey the meaning of zawwajtu (I wed) and qabiltu (I accept). They do not need to appoint an agent in that case. Second, intention: the man and woman — or their agents — must intend to establish the marriage when they say the formula. Saying the words as a joke or a rehearsal does not create a marriage. Third, sanity and maturity: the person saying the formula must be sane, and if saying it for themselves, must be of the age of legal responsibility (baligh). Fourth, the parties must be specified: if agents or guardians say the formula, they must name or indicate the husband and wife. A formula that weds “one of my daughters” without saying which is invalid. Fifth, consent: both the man and the woman must consent. If they appear to disapprove but it is known that in their hearts they consent, the contract is valid. If a marriage is contracted without consent and both later consent, it becomes valid.',
          'A small mispronunciation does not invalidate the contract if the meaning is unchanged. And the couple may recite the formula themselves or appoint representatives (wakil) to recite it for them — a woman may represent a man and a man may represent a woman, and one representative may act for both spouses. There is a well-known account of the marriage of Fatima (a.s.) and Ali (a.s.) in which an alim asked Fatima to appoint him as her representative, she agreed, and he then pronounced the contract to Ali for a dowry of five hundred dirhams.',
          'No cleric is required for the contract to be valid. A cleric is commonly present, and that is good practice, but the couple may perform the nikah themselves.',
        ],
      },
      {
        h2: 'Mahr: the bride’s right',
        p: [
          'The mahr is the marriage gift the husband gives the wife. It is agreed before the nikah and named in the contract, and it belongs to the bride alone. It is her absolute right — not a bride price, not a payment to her family, and not a deposit on the marriage. She may do with it whatever she wishes.',
          'There is no fixed amount. It can be symbolic — a copy of the Quran — or substantial — property, gold, or a sum of money. Many Shia families choose amounts with religious meaning: 14 gold coins for the Fourteen Infallibles; 313 coins for the companions of Imam Mahdi (a.s.); or the mahr of Sayyida Fatima (a.s.), which was 500 silver dirhams. Others choose an amount that reflects the couple’s circumstances — a figure that is meaningful without being a burden.',
          'What matters is that the mahr is agreed, named in the contract, and understood by both sides before the formula is spoken. A mahr agreed in vague terms and argued about afterwards is a bad start to a marriage.',
          'If no mahr is named in the contract, the permanent marriage is still valid. In that case, once the marriage is consummated, the wife is entitled to the mahr al-mithl — the customary mahr of women of her standing. The rule is different for a temporary marriage: if no mahr is named there, the contract is invalid, even if the omission was by mistake or forgetfulness. (Ayatollah Sistani, Islamic Laws, Ruling 2437.)',
        ],
      },
      {
        h2: 'The wali and consent',
        p: [
          'The wali — the bride’s guardian, usually her father or paternal grandfather — plays a real role in a Shia nikah. Per Ayatollah Sistani’s Code of Practice for Muslims in the West, in marrying a virgin woman it is necessary to get the consent of her father or paternal grandfather if she is not independent, and it is precautionarily obligatory to seek their consent even if she is independent. A woman who has been married before does not need her guardian’s permission in the same way.',
          'In practice, the wali’s involvement starts well before the nikah — at the proposal stage, when the families first meet and the wali is part of the conversation. The wali is not an approver brought in at the end. He is a participant from the beginning, and his consent is part of what makes the process a family act rather than a private arrangement.',
          'Consent itself is non-negotiable. Both parties must consent to the marriage, and a marriage contracted without consent is not valid until both consent to it. The bride’s consent being asked three times during the ceremony — with the bride delaying her answer while her female relatives tease that they are “sewing” to silence future interference — is a beloved ceremony custom, not a fiqh requirement. The requirement is consent, asked once and given freely.',
        ],
      },
      {
        h2: 'Witnesses: the point most guides get wrong',
        p: [
          'This is the single most misunderstood fact about Shia nikah, and the guide that currently ranks first for “shia marriage” states it incorrectly. In Shia fiqh, witnesses are not required for the nikah. Ayatollah Sistani’s Code of Practice states it plainly: “There is no condition for the presence of witnesses during the solemnization of the marriage, just as the presence of a cleric is not a condition for the validity of the marriage.”',
          'Witnesses are required for divorce (talaq) in Shia law. That is the opposite of the Sunni position, where witnesses are required for the nikah and not for divorce. The general guides that say two just witnesses must observe the contract are stating the Sunni rule as if it were universal. It is not.',
          'Families still commonly have witnesses present at a Shia nikah, and there is nothing wrong with that — it is good practice and good record-keeping. But it is custom, not a condition of validity. A nikah performed without witnesses, with the formula, intention, consent, mahr, and (where required) the wali’s permission, is a valid marriage.',
        ],
      },
      {
        h2: 'Who may marry whom',
        p: [
          'A Shia man may marry a Sunni woman. The famous verdict — held by Ayatollah Sistani, Ayatollah Makarem Shirazi, and the late Ayatollah Lankarani — is that it is permissible, provided there is no fear that the marriage will lead one to lose one’s faith.',
          'A Shia woman marrying a Sunni man is restricted. In Ayatollah Sistani’s view it is not permissible as a matter of obligatory precaution, because of the risk to her beliefs; the late Ayatollah Bahjat took the same position. Other maraji treat it as disliked (makruh) rather than forbidden. A family in this situation should ask its own marja — and should understand that “obligatory precaution” means the ruling must be followed unless another qualified marja is followed on that point.',
          'Marriage to a non-Muslim. A Muslim man may not contract a permanent marriage with a woman who is not among the People of the Book. Temporary marriage with a woman of the People of the Book is permissible in Shia law, with conditions; Ayatollah Sistani treats even that with obligatory precaution. A Muslim woman may not marry a non-Muslim man at all.',
          'Forbidden relations. Marriage with close relatives (mahram) is forbidden: mother, daughter, sister, paternal and maternal aunts, nieces, stepmother, mother-in-law, and the others named in the rulings. Also forbidden: marriage to a woman who is already married, a woman in her waiting period (iddah), and marriage to the followers of sects that Shia law does not regard as Muslim, such as the Ghulat, the Nasibis, and the Khawarij.',
          'Where a question is genuinely disputed, the right step is to ask a scholar who follows your marja, not to rely on a website — including this one.',
        ],
      },
      {
        h2: 'Temporary marriage (mut’ah)',
        p: [
          'Temporary marriage deserves an honest paragraph, because it is the part of Shia law that outsiders most often misunderstand and insiders most often avoid discussing.',
          'In a temporary marriage, the duration and the mahr are fixed in the contract. The formula is the same as for a permanent marriage, with the duration stated: “I give myself to you in marriage for the dowry of [x] for the time period of [x].” The duration may be short or long. The same conditions apply — formula, intention, consent, and (where required) the wali’s permission — and the same rules on who may marry whom, with the additional point that a Muslim man may contract a temporary marriage with a woman of the People of the Book.',
          'Temporary marriage is a real and lawful part of Shia fiqh. It is also a subject on which families hold very different views, and it is not what most people mean when they search for a Shia rishta. This guide states the law; it does not recommend for or against it. A family considering it should speak to a scholar.',
        ],
      },
      {
        h2: 'From proposal to wedding: the journey',
        p: [
          'The contract is the legal core of a Shia marriage. Around it, families have built a journey of ceremonies that varies by culture but follows a recognisable shape.',
          'Khastegari — the asking. The groom’s family visits the bride’s home, often bringing flowers or Persian gaz or Iraqi kleicha sweets. The families discuss compatibility: education, life goals, religious observance, expectations about extended family. The bride may serve tea. The moment both families agree, obligations begin under Shia law, before any date has been named.',
          'Istikhara — seeking guidance. Before proceeding, many families do istikhara: special prayers, then opening the Quran at random and reading the first verse, or using prayer beads, where an odd count suggests a positive answer. In Iraq and Iran, families may perform istikhara at the shrine of an Imam. It is a spiritual consultation, not fortune-telling — and the families that use it well combine it with the practical questions, not instead of them.',
          'Namzadi / Mangni — the engagement. The private understanding becomes public. In Persian communities this may be the Shirini Khoran, the eating of sweets, where accepting the sweets symbolises accepting the union. Families present gold coins inscribed with Ayat al-Kursi, prayer beads made from Karbala clay, and rings. In South Asian Shia communities, the Mangni brings tables of mithai and a dupatta — sometimes one that belonged to the groom’s mother or grandmother — presented to the bride as a welcome into the family.',
          'Baleh Boroun — the final preparations. In Persian families, this is where the mahr moves from an abstract concept into specific commitments: 14 gold coins, a piece of land, the promise of a pilgrimage to Karbala. Elders share advice; younger relatives plan logistics.',
          'The nikah and the sofreh aghd. The contract is spoken, and around it the celebration unfolds. In Iranian families the sofreh aghd spread is laid out: a mirror (aayeneh) reflecting the couple, candelabras, bread, feta cheese and herbs, decorated eggs for fertility, gold coins for prosperity, the Quran open to verses about marriage, and wild rue (esfand) burning against the evil eye. Happily married women hold a cloth canopy above the couple and rub sugar cones together — the kalleh ghand — so sweetness rains down on the union. The sofreh aghd is Persian, not universal: an Iraqi family, an Azeri family, a family from Bahrain each bring different customs to the same contract.',
          'The walima — the feast. After the nikah comes the walima, the wedding feast. Its form is celebration, not law: a hall dinner, a family gathering, a multi-day aroosi. The marriage is already valid. The feast is the community’s welcome to it.',
        ],
      },
      {
        h2: 'Regional variations: the same contract, different celebrations',
        p: [
          'The nikah is one contract. The wedding around it belongs to the family’s culture, and Shia weddings vary enormously by region.',
          'Iranian. The most elaborate ceremonial tradition, centred on the sofreh aghd described above. The aroosi may span several events over a week. The pagosha ceremony — the bride stepping into her new home over a Quran, her mother-in-law presenting gold jewellery — marks her welcome. The raghseh chagoo, the knife dance, has become competitive entertainment: dancers hold the cake knife hostage and demand ransoms from the groom, from money for charity to public declarations of love.',
          'Iraqi. Weddings maintain connections to ancient Mesopotamian celebration. The henna night is central, with intricate designs incorporating the names of the Fourteen Infallibles alongside the couple’s initials. The feast centres on quzi (whole roasted lamb) with amber rice, masgouf (grilled fish), and kleicha cookies filled with dates. The seven-day celebration, rarely practised in full today, still shapes the extended nature of the festivities.',
          'Lebanese. Arab tradition with Mediterranean flair. The zaffe entrance — professional dancers and drummers leading the couple in, sometimes lasting an hour — announces the new family. The dabke line dance turns the reception into a multigenerational event, with steps passed from grandparents to children.',
          'Pakistani and South Asian. Biryani, seekh kebabs, and sheer khurma at the feast; mangni and mehndi ceremonies alongside the nikah; the dupatta as a symbol of welcome into the family. Shia families blend the religious requirements with regional customs, and the first servings of food are often sent to mosques or distributed to the poor.',
          'The diaspora (UK, USA, Canada). In the diaspora, families mix traditions from their country of origin with the practicalities of a new home: a nikah in a mosque or a hired hall, a walima that seats two extended families who flew in from three continents, a ceremony that honours both the grandparents’ customs and the couple’s own life. The contract is the same. The celebration is the family’s own.',
        ],
      },
      {
        h2: 'The nikah and the law: civil registration',
        p: [
          'The nikah makes the marriage valid in religious law. In the UK, the USA, and Canada, a couple also needs a civil marriage for the marriage to be recognised in law — for visas, inheritance, hospital rights, and everything else the state governs. The religious contract and the legal registration are separate things, and the requirements vary by country and by state or province.',
          'Couples should check the civil requirements where they live and make sure the registration is done. A nikah performed by a scholar who is also a registered officiant may cover both at once; otherwise the couple will need a separate civil ceremony or registration. Do not assume the nikah alone is legally recognised — in most of the UK, USA, and Canada, it is not, unless the officiant is authorised to register the marriage.',
        ],
      },
      {
        h2: 'Finding a spouse for nikah',
        p: [
          'A guide can explain the nikah. It cannot find the person to share it with. That is the part most Shia families in the diaspora find hardest: the local community is small, children move away for work or study, and the traditional networks do not always produce a match.',
          'ShiaRishta exists for that search. Verified Shia profiles from the UK, USA, and Canada, filtered by marja and practice, with photo and ID verification badges, family-led introductions with the wali involved from the start, and a free biodata maker families can share on WhatsApp. Joining is free. Browse profiles or create a free account to start.',
        ],
      },
    ],
    faq: [
      { q: 'What is a Shia nikah?', a: 'The nikah is the marriage contract in Islam. In Shia law, the woman says “Zawwajtuka nafsi ’ala as-sidaq al-ma’lum” (I have made myself your wife on the agreed mahr) and the man replies “Qabiltut tazwij” (I accept the marriage). When the formula is spoken with intention and consent, the marriage is valid.' },
      { q: 'Do I need witnesses for a Shia nikah?', a: 'No. Witnesses are not a condition for the nikah in Shia fiqh — they are required for divorce, not for marriage. This is the opposite of the Sunni position, and the point most general guides get wrong. Families commonly have witnesses present as a matter of custom, but it is not a condition of validity.' },
      { q: 'Does a cleric need to perform the nikah?', a: 'No. The couple may recite the formula themselves or appoint representatives. A cleric is commonly present and is good practice, but is not a condition of validity.' },
      { q: 'What is mahr, and how much should it be?', a: 'Mahr is the husband’s gift to the wife, agreed before the nikah and named in the contract. It is her absolute right. There is no fixed amount — it can be symbolic (a copy of the Quran) or substantial (property or money). Many families choose amounts with religious meaning, such as the 500 silver dirhams of Sayyida Fatima (a.s.).' },
      { q: 'What happens if no mahr is named in the contract?', a: 'For a permanent marriage, the contract is still valid, and once the marriage is consummated the wife is entitled to the mahr al-mithl — the customary mahr of women of her standing. For a temporary marriage, a contract with no mahr named is invalid, even if the omission was a mistake. (Ayatollah Sistani, Islamic Laws, Ruling 2437.)' },
      { q: 'What is the wali’s role?', a: 'The wali — usually the bride’s father or paternal grandfather — must consent to the marriage of a virgin woman, and per Ayatollah Sistani it is precautionarily obligatory to seek his consent even if she is independent. A previously married woman does not need her guardian’s permission in the same way.' },
      { q: 'Can a Shia marry a Sunni?', a: 'Per the famous verdict (Ayatollah Sistani, Ayatollah Makarem Shirazi, and others), a Shia man marrying a Sunni woman is permissible, provided there is no fear of losing one’s faith. A Shia woman marrying a Sunni man is restricted by obligatory precaution in Sistani’s view. Rulings differ by marja — ask your own.' },
      { q: 'What is the difference between a Shia nikah and a Sunni nikah?', a: 'The core — contract, mahr, consent, formula — is the same. The differences: witnesses are not required for a Shia nikah but are for a Sunni one; witnesses are required for a Shia divorce but not for a Sunni one; Shia law recognises temporary marriage (mut’ah) and Sunni law does not; and some rules on who may marry whom differ.' },
      { q: 'What is mut’ah (temporary marriage)?', a: 'A marriage in which the duration and the mahr are fixed in the contract. It follows the same contract rules — formula, consent, mahr — with the duration stated. It is a lawful part of Shia fiqh and is not recognised in Sunni law. Families considering it should speak to a scholar.' },
      { q: 'Is a nikah enough, or do I need a civil marriage too?', a: 'In the UK, USA, and Canada, the nikah is the religious marriage. For legal recognition you also need a civil marriage registration. Check the requirements where you live.' },
      { q: 'How long does a Shia wedding take?', a: 'The nikah itself takes minutes. The celebrations around it — khastegari, engagement, baleh boroun, walima — can span days or weeks depending on the family’s customs. An Iranian aroosi may run over a week; a diaspora wedding may compress everything into a weekend.' },
    ],
  },
  'shia-marriage': {
    h1: 'Shia marriage, from proposal to nikah',
    sections: [
      {
        h2: 'The stages of a Shia marriage',
        p: [
          'A Shia marriage is a contract, a family agreement, and the start of a household — in that order. The contract is the nikah. The family agreement is everything that happens before it: the proposal, the discussions between families, the wali’s involvement, and the settling of the mahr. And the household is what the marriage is for.',
          'This page explains how Shia marriage works, what each stage involves, and how Shia families find a spouse today — including through ShiaRishta.',
          'The proposal (khastegari). The process usually begins with a formal proposal: the groom’s family approaches the bride’s family, often bringing flowers or sweets, and the two families meet. This is the khastegari, and it is not a formality. It is the meeting where compatibility is first examined — education, life goals, religious observance, expectations about extended family. In the diaspora, this meeting may happen in a restaurant or by video call when families live in different countries, but the purpose is the same.',
          'Family discussion and the wali. After the proposal, the families discuss expectations, and the wali — the bride’s guardian, usually her father — is part of the conversation. The wali’s role is real in Shia marriage: for a virgin woman, the consent of her father or paternal grandfather is required (and, per Ayatollah Sistani, it is precautionarily obligatory to seek it even if she is independent). A woman who has been married before does not need her guardian’s permission in the same way. What varies most in practice is how early the family is involved, and how much of the process is expected to be private between the couple. Those are worth agreeing explicitly rather than assuming.',
          'Istikhara. Many families seek guidance through istikhara before proceeding — prayer and reflection on whether the marriage is right. It is a spiritual consultation, not a substitute for thinking: the families that use it well combine it with the practical questions, so the guidance confirms a decision the facts already support.',
          'The mahr. Before the nikah, the families agree the mahr — the marriage gift the husband gives the wife. The mahr is the bride’s absolute right, and it belongs to her alone. It can be symbolic (a copy of the Quran) or substantial (property, gold, or a sum of money). Many Shia families choose amounts with religious significance — for example, 14 gold coins for the Fourteen Infallibles, or 313 coins for the companions of Imam Mahdi (a.s.). The mahr of Sayyida Fatima (a.s.) was 500 silver dirhams, and many families take that as a reference point. What matters is that the mahr is agreed before the contract, named in it, and understood by both sides.',
          'The nikah. The nikah is the contract itself. The woman says the formula — “Zawwajtuka nafsi ’ala as-sidaq al-ma’lum” (I have made myself your wife on the agreed mahr) — and the man replies immediately, “Qabiltut tazwij” (I accept the marriage). In Shia fiqh, the formula should be said in Arabic as a matter of obligatory precaution, but if the couple cannot say it in Arabic, they may say it in another language using words that convey the same meaning. The couple may recite it themselves or appoint representatives to recite it for them. No cleric is required for the contract to be valid, and — unlike Sunni practice — no witnesses are required for the nikah itself in Shia fiqh. (Witnesses are required for divorce, not for marriage — the opposite of the Sunni position.) Both parties must consent, and both must intend the marriage.',
          'The walima. After the nikah comes the walima, the wedding feast. Its form varies enormously: a large hall in London or Houston, a family gathering in Dearborn, a sofreh aghd spread in an Iranian family, a mangni and mehndi in a South Asian one. The feast is celebration, not contract. The marriage is already valid.',
        ],
      },
      {
        h2: 'What makes a Shia marriage different',
        p: [
          'The contract is the marriage. In Shia Islam, the nikah is not a blessing on a relationship that already exists. It is the act that creates the marriage. Two people become husband and wife when the formula is spoken with intention and consent — not when a ceremony is held, not when a document is signed. That is why the details of the contract matter so much, and why families take care over the mahr, the formula, and the wali’s permission.',
          'The wali’s role is structural. The wali is not a guest at the wedding. For a virgin bride, the father’s or paternal grandfather’s consent is part of the process. This reflects a view of marriage as a family act, not a private arrangement between two individuals.',
          'Temporary marriage exists. Shia fiqh recognises two kinds of marriage: permanent and temporary (mut’ah), where a duration and a mahr are fixed in the contract. Temporary marriage follows the same contract rules — formula, consent, mahr — with the duration stated. It is a real and distinctively Shia part of the law, and a family should understand it exists even if it is not what they are seeking.',
          'Rulings differ by marja. The details above follow the widely followed rulings of Ayatollah Sistani. Other maraji differ on points of detail — for example, on the conditions around a Shia woman marrying a Sunni man. A family should follow its own marja and, where a question is genuinely disputed, ask a scholar rather than relying on a website.',
        ],
      },
      {
        h2: 'Finding a Shia spouse',
        p: [
          'The search for a spouse is the hardest part of a Shia marriage for most families in the diaspora. The local community is small, children move away for work or study, and the traditional networks — relatives, the local centre — do not always produce a match.',
          'That is what ShiaRishta is for. It gathers verified Shia profiles from the UK, USA, and Canada into one pool, filtered by the things families actually ask about: marja, practice, age, education, and location. Profiles carry photo and ID verification badges. The introduction process is family-led, with the wali involved from the start. And the biodata maker lets a family build a clean, shareable biodata and send it on WhatsApp — the format most Shia families already use.',
          'Joining is free. Browse profiles or create a free account to start.',
        ],
      },
      {
        h2: 'Marriage across distance',
        p: [
          'Many Shia marriages in the diaspora are long-distance: one family in London, the other in Toronto; a match in Houston for a family in Baltimore. Distance adds questions a local match does not raise: where will the couple live, how often will they visit family, what does immigration involve, and how will the wedding itself be arranged across two countries?',
          'The advice is simple: discuss these questions before the nikah, not after it. A match that is right in every other respect can still fail if the couple never agreed where they would live. Families that talk about it early — during the introduction stage, not during wedding planning — avoid the hardest arguments.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between a Shia marriage and a Sunni marriage?', a: 'The core is the same: a nikah contract with a mahr, consent, and a formula. The differences are in the details: in Shia fiqh, witnesses are not required for the nikah (they are required for divorce), while in Sunni fiqh witnesses are required for the nikah and not for divorce. The wali’s role, the treatment of temporary marriage, and some rules on who may marry whom also differ. Rulings vary by marja and school, so a mixed-school family should ask a scholar about their specific situation.' },
      { q: 'Is a nikah valid without a cleric present?', a: 'Yes, in Shia fiqh. The contract requires the formula, intention, consent, and (where applicable) the wali’s permission. A cleric is not a condition for validity, and the couple may recite the formula themselves or appoint representatives.' },
      { q: 'Do I need witnesses for a Shia nikah?', a: 'No. In Shia fiqh there is no condition for the presence of witnesses at the solemnisation of the marriage. Witnesses are required for divorce (talaq), not for marriage. This is the opposite of the Sunni position, and it is the point most general guides get wrong.' },
      { q: 'What is mahr, and how much should it be?', a: 'Mahr is the marriage gift from the husband to the wife, agreed before the nikah and named in the contract. It is the bride’s absolute right. There is no fixed amount: it can be symbolic or substantial, and many families choose amounts with religious meaning. The mahr of Sayyida Fatima (a.s.) was 500 silver dirhams.' },
      { q: 'Can a Shia marry a Sunni?', a: 'Rulings differ by marja. The famous verdict is that a Shia man marrying a Sunni woman is permissible, provided there is no fear of losing one’s faith; a Shia woman marrying a Sunni man is restricted by obligatory precaution in Ayatollah Sistani’s view, because of the risk to her beliefs. Families in this situation should ask their own marja.' },
      { q: 'How do I find a Shia spouse if my local community is small?', a: 'Widen the search: a platform like ShiaRishta shows verified profiles from other cities and countries, and long-distance introductions are normal in the Shia diaspora. Matchmakers can also search on a family’s behalf.' },
    ],
  },
  'shia-brides': {
    h1: 'Shia brides seeking nikah',
    more: 'Browse profiles of Shia women looking for marriage, with the details families actually decide on: age, city, education level, religiosity, prayer practice and family background. Every profile states marriage intent up front, so nobody has to guess whether a profile is casual. Photos are private by default: a bride can show photos to everyone, to people she has mutual interest with, or only to matches, and that choice is enforced on the server rather than hidden in the interface.',
  },
  'shia-grooms': {
    h1: 'Shia grooms seeking nikah',
    more: 'Browse profiles of Shia men looking for marriage, filtered by the same criteria families use elsewhere: age, city, education, religiosity, prayer practice and family background. Sect and marja are separate searchable fields rather than a line in a biography. Photos follow the same three-tier privacy model as every other profile, and a conversation can only begin after interest is mutual from both sides.',
  },
  'syed-rishta': {
    h1: 'Syed and Syeda rishtas for nikah',
    more: 'Families looking for a sayyid rishta can filter specifically for it. Syed status is a searchable field on this platform, which means a family can narrow a list by lineage without reading through every profile. It is a real constraint for a real marriage market, and leaving it to be discovered by chance is how families end up with mismatches they did not intend.',
  },
  'shia-matrimonial': {
    h1: 'Shia matrimonial profiles',
    more: 'A general search across Shia matrimonial profiles, filterable by sect, marja, religiosity, prayer practice, education, age, city and country. The point of structured filters is that a family can do the narrowing themselves rather than sending messages and finding out two conversations later that a fundamental position differs.',
  },
  'shia-matrimony-usa': {
    h1: 'Shia matrimony in the United States',
    more: 'Shia matrimonial profiles across the United States, searchable by city and state, plus sect, marja and practice. Useful for families spread across the country who want to narrow by where someone actually lives rather than by an overseas hometown listing. Privacy matters more, not less, for a diaspora community where an extended family network can make a visible profile effectively public.',
  },
  'shia-matrimony-london': {
    h1: 'Shia matrimony in London',
    more: 'Shia matrimonial profiles in London and across the UK, searchable by city, plus sect, marja and practice. Filter for where someone lives now rather than where their family is from, which is often not the same thing in a diaspora. Photos default to the most private setting, and a conversation opens only after interest is mutual.',
  },
  'shia-matrimony-toronto': {
    h1: 'Shia matrimony in Toronto',
    more: 'Shia matrimonial profiles in Toronto and across Canada, searchable by city, plus sect, marja and practice. Built for families in the Greater Toronto Area who want to narrow by practice and location together. Free to browse, and no account is required to view public profiles.',
  },
  'shia-matrimony-chicago': {
    h1: 'Shia matrimony in Chicago',
    more: 'Shia matrimonial profiles in Chicago and across Illinois, searchable by city, plus sect, marja and practice. Privacy-first by default: photos follow a three-tier visibility setting, contact details are never published, and messaging requires mutual interest.',
  },
  'shia-matrimony-houston': {
    h1: 'Shia matrimony in Houston',
    more: 'Shia matrimonial profiles in Houston and across Texas, searchable by city, plus sect, marja and practice. A large and diverse Shiite community, which is exactly why filtering by marja and practice rather than assuming similarity is worth doing. No account needed to browse public profiles.',
  },
  'shia-matrimony-new-york': {
    h1: 'Shia matrimony in New York',
    more: 'Shia matrimonial profiles in New York and across the state, searchable by city, plus sect, marja and practice. Photo privacy and mutual-interest messaging are enforced server-side, so a locked photo is never delivered to your browser at all.',
  },
  'nikah-checklist': {
    h1: 'A checklist for preparing for nikah',
    more: 'A practical list of what to have ready: identification for everyone attending as witness, the agreed mahr, the wali arrangements confirmed in advance, and a clear understanding of who is witnessing and in which order. Most nikah problems are administrative rather than theological; they come from not having agreed something in advance that everyone then assumed the other side had handled.',
  },
  'duas-for-marriage': {
    h1: 'Duas and supplications for marriage',
    more: 'Supplications to read before nikah, for the couple and for their families. The duas recited for marriage are well established and are part of the nikah itself rather than something added to it. Religious practice is personal, and the structured fields on a profile exist so families can state what they follow rather than infer it.',
  },
  'shia-matrimony-dearborn': {
    h1: 'Shia matrimony in Dearborn and Detroit',
    more: 'Dearborn holds one of the densest Shia Muslim populations in the United States, yet families tend to search inside their own sub-community and miss compatible matches nearby. Structured search across the whole metro — by marja, practice, language and background — with wali involvement and photo privacy throughout.',
  },
  'shia-matrimony-dallas': {
    h1: 'Shia matrimony in Dallas–Fort Worth',
    more: 'DFW is one of the fastest-growing Shia communities in America, but its sprawl works against rishta. One search across the entire metroplex — verified profiles, marja and practice filters, wali-involved introductions — built for a young, professional community where time is scarce.',
  },
  'shia-matrimony-los-angeles': {
    h1: 'Shia matrimony in Los Angeles',
    more: 'LA has one of the most diverse Shia communities in the country, spread across an unforgiving geography. Search all of Southern California in one place — Persian, Arab, South Asian and convert families — with honest filters for marja, language and practice, and introductions your wali joins from the start.',
  },
  'shia-matrimony-bay-area': {
    h1: 'Shia matrimony in the San Francisco Bay Area',
    more: 'A small, accomplished, scattered community where discretion is a requirement, not a luxury. Verified profiles across the Bay Area with photo privacy enforced server-side — locked photos are never delivered to the browser — and efficient, guardian-visible search for demanding schedules.',
  },
  'shia-matrimony-atlanta': {
    h1: 'Shia matrimony in Atlanta',
    more: 'Atlanta\u2019s Shia community is growing fast, full of transplants whose rishta networks are still back in the old city. Search Atlanta and Georgia while staying connected to family elsewhere — wali workflows span time zones, and family-to-family introductions work across continents.',
  },
  'shia-matrimony-seattle': {
    h1: 'Shia matrimony in Seattle',
    more: 'A small, young community where the local rishta pool can feel like a dozen families you already know. Widen the search to the Pacific Northwest and nationwide while keeping small-community discretion — photo privacy, mutual-interest messaging, and structured long-distance courtship.',
  },
  'shia-rishta-chicago': {
    h1: 'Shia rishta in Chicago',
    more: 'Chicago has one of America\u2019s largest Shia communities, but it is fragmented across suburbs, languages, and cultural backgrounds \u2014 and the rishta search still runs on majlis gossip and a khala who knows someone in Schaumburg. One verified, searchable pool for the whole metro \u2014 filtered by marja, practice, and family values \u2014 puts every serious Chicago Shia family in front of each other, with wali involvement from the first introduction.',
  },
  'shia-rishta-houston': {
    h1: 'Shia rishta in Houston',
    more: 'Houston\u2019s Shia community is growing fast, with new families arriving every year \u2014 but the rishta network has not kept up, and newcomers spend years just getting known. A verified platform profile skips that waiting period: visible to every serious Shia family searching in Texas from day one, searchable by marja, practice, and family expectations.',
  },
  'shia-rishta-new-york': {
    h1: 'Shia rishta in New York',
    more: 'New York\u2019s Shia community is spread across five boroughs and New Jersey, split by language and culture \u2014 and rishta introductions rarely cross those lines. One verified pool for the whole metro, filterable by marja, practice, education, and family values, collapses that distance so the right match is never missed over a borough line.',
  },
  'shia-rishta-london': {
    h1: 'Shia rishta in London',
    more: 'London\u2019s Shia rishta scene runs on the auntie network \u2014 the same few names circulating for years, good profiles never surfacing because nobody knows the right aunty. A verified platform is the auntie network upgraded: every searching Shia family in London and across the UK in one place, with photo and ID verification badges instead of unverifiable vouches.',
  },
  'shia-rishta-toronto': {
    h1: 'Shia rishta in Toronto',
    more: 'Toronto\u2019s Shia community is among the strongest in North America, yet families search in separate lanes \u2014 Khoja, Desi, Arab, Persian networks that rarely exchange introductions. One shared, verified directory for the GTA and across Canada breaks those lanes open, with cross-border wali workflows for the many matches that span into the US.',
  },
  'shia-rishta-dearborn': {
    h1: 'Shia rishta in Dearborn',
    more: 'Dearborn holds the densest Shia population in North America \u2014 which makes the rishta paradox sharper here: surrounded by community, yet families search the same small circles because asking around means the whole community knows you asked. Private, discreet platform search with real compatibility filters \u2014 marja, practice, expectations \u2014 lets families control the pace.',
  },
  'shia-rishta-dallas': {
    h1: 'Shia rishta in Dallas\u2013Fort Worth',
    more: 'DFW\u2019s Shia community is young, professional, and growing \u2014 full of engineers and doctors whose rishta networks are still in another city. A serious, efficient, Shia-only search that respects demanding schedules: verified profiles, real filters, mutual-interest gating, and wali involvement designed in from the start.',
  },
  'shia-rishta-los-angeles': {
    h1: 'Shia rishta in Los Angeles',
    more: 'LA\u2019s Shia community stretches from the Valley to Orange County to the Inland Empire \u2014 and introductions cluster by neighborhood, so a compatible family forty minutes away stays invisible. One metro-wide verified pool erases the geography problem, with precise filters for a genuinely diverse Persian, Arab, Desi, and convert community.',
  },
  'shia-rishta-bay-area': {
    h1: 'Shia rishta in the Bay Area',
    more: 'The Bay Area\u2019s Shia professionals were drawn by careers that left their family rishta networks thousands of miles behind. A verified platform rebuilds that network: serious Shia profiles, rigorous compatibility filters, and wali involvement that works over video call \u2014 visible both locally and to families back home searching worldwide.',
  },
  'shia-rishta-atlanta': {
    h1: 'Shia rishta in Atlanta',
    more: 'Atlanta\u2019s growing Shia community still feels small for rishta purposes \u2014 the grapevine exhausts itself fast. The serious strategy is a national search done properly: verified profiles, private video introductions, family-to-family messaging, and cross-city wali approvals that turn long-distance rishtas from a gamble into a process.',
  },
  'shia-rishta-seattle': {
    h1: 'Shia rishta in Seattle',
    more: 'Seattle\u2019s small, scattered Shia community means the local rishta grapevine is nearly silent. The answer is a national search with structure: verified profiles across America, West Coast clusters within natural reach, and video introductions plus wali workflows that make distance irrelevant.',
  },
  'shia-rishtay': {
    h1: 'Shia rishtay for nikah',
    sections: [
      {
        h2: 'What is a Shia rishta?',
        p: [
          '“Rishta” is singular. “Rishtay” is what families actually search for — the proposals a family weighs together, comparing deen, practice, and family values before choosing. A rishta is not a date. It is a proposal carried by a family, examined by a family, and answered by a family. That is the whole difference between a Shia rishta and the way the rest of the internet talks about dating, and it is why the search for one works differently too.',
          'This page explains what a Shia rishta is, how Shia matchmaking actually works, what families look for, and how to search for verified Shia rishtay in the UK, USA, and Canada — including Baltimore, Houston, Dearborn, London, and Toronto.',
          'A rishta is a marriage proposal. In Shia families it usually begins when one family learns of a suitable person — through relatives, through the community, through a matchmaker, or through a platform like ShiaRishta — and approaches the other family. The two people at the centre of it are not shopping. Their families are doing the first round of checking together: is this person Shia, what marja do they follow, how do they practise, what does their family value, what do they want from a marriage?',
          'The word itself carries the weight. A rishta is not a match or a connection. It is a proposal with a family behind it, and the answer to a rishta is a family decision. That is why Shia parents stay involved from the first introduction rather than joining the process at the end. The wali — the bride’s guardian, usually her father — is part of the conversation from the start, not brought in to approve something already decided.',
        ],
      },
      {
        h2: 'What makes a Shia rishta different',
        p: [
          'Marja. Which marja a person follows shapes their practice — the rulings they live by on everything from prayer to marriage itself. Families ask this early because it tells them more than a label does. Two people can both be Shia and still differ meaningfully in practice depending on whose rulings they follow. A serious rishta search filters on it.',
          'Practice. Not just belief, but how belief is lived: prayer, fasting, hijab, azadari, community involvement. Families do not ask this to judge. They ask because a marriage is two people building one household, and the daily shape of that household is decided by practice, not by identity alone.',
          'Family involvement. In a Shia rishta the families are not an audience. They are participants. The wali’s role is real, the parents on both sides talk before the couple is left to decide, and the process is designed so that nobody is surprised by what the other side expects. This is not old-fashioned. It is the mechanism that keeps a marriage honest about what it is.',
        ],
      },
      {
        h2: 'How Shia matchmaking works, step by step',
        p: [
          'The search. Families look within their own networks first — relatives, friends, the local centre — and then widen the search. This is where a platform helps: it puts verified profiles from other cities and countries in front of a family that has already exhausted its local circle. A good search is filtered by marja, practice, age, education, and location, because a family that has to read a hundred irrelevant profiles will stop reading.',
          'The shortlist. Families compare a small number of serious proposals rather than collecting as many as possible. The questions at this stage are practical: deen and practice, family background, education and work, health, and what each side wants from the marriage. A biodata — a one-page summary of the person and their family — is how most families do this, and it is why a clear, honest biodata matters more than a long one.',
          'The introduction. When both families are interested, they arrange an introduction. The wali is present or informed. The couple meets with family around them, not alone, and the conversation is about compatibility — values, expectations, how each side sees married life. Nobody is asked to decide anything at this meeting.',
          'Istikhara and reflection. Many families do istikhara — seeking guidance through prayer — before proceeding. It is not a substitute for thinking. Families that do it well use it alongside the practical questions, not instead of them: the guidance confirms a decision that the facts already support.',
          'Agreement and nikah. When both sides agree, the mahr is settled, the nikah is performed, and the marriage begins. The walima — the wedding feast — follows, in whatever form the families choose.',
        ],
      },
      {
        h2: 'What families look for in a rishta',
        p: [
          'Deen first. Not a performance of piety, but a real, lived commitment: prayer, fasting, honesty, and a relationship with the Ahlul Bayt that shows up in daily life. Families look for evidence, not claims — how a person speaks about their faith, what they do in their community, how they treat their parents.',
          'Practice that matches. Two people do not need identical practice, but they need compatible practice. A family that prays together and a person who does not pray will argue about the shape of every day. Better to find out early.',
          'Family values. How does the family treat its elders? What do they expect of a daughter-in-law or a son-in-law? How involved will the extended family be? These are not small questions. They decide the marriage as much as the couple does.',
          'Education and livelihood. Not wealth, but stability and seriousness: a person who is building something, who takes responsibility, who can support a household. Families care far more about direction than about a salary figure.',
          'Character. Kindness, patience, honesty, and the ability to admit fault. These are hard to check on a profile, which is why families talk to people who know the person — and why verified profiles, where identity has actually been checked, matter.',
        ],
      },
      {
        h2: 'Shia rishtay by city',
        p: [
          'Baltimore, USA. Baltimore is home to a growing Shia community, and families here often search across the Washington DC–Baltimore corridor as one area. The practical question for a Baltimore rishta is distance: a match in Northern Virginia or Washington DC is close enough for families to meet easily, and many families treat the whole corridor as local. For families in Baltimore, a platform that shows verified profiles from across the corridor — not just one city — makes the difference between a search that stalls and one that moves.',
          'Houston, USA. Houston has a large and active Shia community, with several centres and a strong network of families. The search here benefits from community size: there are more profiles, more events, and more family connections to check through. The challenge is the opposite of a small community — filtering. A Houston family needs search filters that actually work (marja, practice, education) so the size of the pool helps rather than overwhelms.',
          'Dearborn, USA. Dearborn, Michigan, has a large, well-established Shia community, one of the longest-standing in the United States. Families here often have deep local networks, and a rishta may come through relatives or the local centre before it ever reaches a platform. Where a platform helps in Dearborn is for families whose children have moved away, or for those looking beyond the local circle — a verified profile from another state, checked the same way a local introduction would be.',
          'London, UK. London’s Shia community is large and spread across the city, with established centres and a strong tradition of community events. A London rishta search often spans the whole city and beyond — Birmingham, Manchester, and other UK cities are all within reach for family meetings. For London families, the question is usually not whether there are profiles, but whether the profiles are real. Verification matters more than volume.',
          'Toronto, Canada. Toronto has a large Shia community and a steady flow of new families. The search here often crosses the border — families in Toronto look at profiles in the United States as well, particularly in nearby states. A Toronto rishta may involve questions about immigration and settlement that a local match does not, and families do well to discuss those early rather than after the nikah.',
        ],
      },
      {
        h2: 'How ShiaRishta works',
        p: [
          'Verified profiles. Profiles carry photo and ID verification badges, so a family knows the person behind the profile has been checked. Verification does not guarantee character — nothing can — but it removes the most common fraud from the search entirely.',
          'Filters that match the questions families ask. Search by marja, practice, age, education, and location, instead of scrolling through profiles that were never relevant.',
          'Photo privacy the member controls. A member decides who sees their photos, which matters for families who want privacy while they search.',
          'Wali involvement from the first introduction. The process is built around family-led introductions, not private messaging between strangers.',
          'A free biodata maker. Families can build a clean, shareable biodata and send it on WhatsApp — the format most Shia families already use to share a proposal.',
          'Matchmaker accounts. Matchmakers can submit profiles for the families they serve, with admin review.',
          'Modern apps. ShiaRishta runs on the web and on iOS and Android, so a family can search from wherever they are.',
          'Joining is free. Browse profiles or create a free account to start a search.',
        ],
      },
    ],
    faq: [
      { q: 'Is ShiaRishta free?', a: 'Yes. Joining, browsing, and creating a profile are free, and there are no charges based on where you live.' },
      { q: 'How does verification work?', a: 'Members can verify their photo and their government ID. Verified profiles carry badges, and approving an ID gives a gold “ID Verified” badge while approving a selfie gives a blue “Photo Verified” badge. Verification checks identity, not character — families should still do their own checking.' },
      { q: 'Can I search by marja?', a: 'Yes. Profiles can be filtered by marja and by practice, because those are the questions families ask first.' },
      { q: 'What is the wali’s role on ShiaRishta?', a: 'The wali — usually the bride’s father — is part of the introduction process from the start. Introductions are family-led, and the wali’s involvement is built into how introductions work rather than added at the end.' },
      { q: 'Can my family search with me?', a: 'Yes. Parents and guardians can be involved in the search and in introductions, and matchmakers can submit profiles on behalf of families they serve.' },
      { q: 'What if the match is in another country?', a: 'Long-distance rishtay are common in the Shia diaspora. Families should discuss the practical questions early: where the couple will live, how often they will visit, and what the immigration and settlement picture looks like. A platform search makes the introduction; the families decide the rest.' },
      { q: 'Do you have profiles outside the UK, USA, and Canada?', a: 'ShiaRishta welcomes members from any country. The search is strongest in the UK, USA, and Canada, where the member base is largest, and it grows as more families join.' },
      { q: 'How is this different from a general Muslim matrimony site?', a: 'ShiaRishta is Shia-specific: marja filters, wali involvement, and a process built around how Shia families actually arrange a rishta. A general site cannot filter on the things that matter most to a Shia family.' },
    ],
  },
  'shiamatch-alternative': {
    h1: 'Looking for a ShiaMatch alternative?',
    sections: [
      {
        h2: 'What is ShiaMatch?',
        p: [
          'Looking for a ShiaMatch alternative? ShiaMatch has served the Shia community for a long time, and many families found their match there. But it was built in a different era of the internet, and it shows — in what it charges, in how it works, and in what it does not offer. ShiaRishta is the free alternative: no charges for men in the USA, UK, or Canada, verified profiles, a free biodata maker, matchmaker accounts, and modern iOS and Android apps.',
          'This page compares the two honestly, so your family can choose the one that fits.',
          'ShiaMatch is an online tool to help Shia Muslims find a suitable match. Its domain has been registered since November 1999, making it one of the oldest Shia matrimony sites on the internet. Its own homepage says it features thousands of Shia Muslim matrimonial profiles from around the world, and its purpose, in its own words, is to expand your network of prospective matches, complementing your search through traditional means.',
          'That longevity matters. A site that has run for more than two decades has a large pool of profiles and a long record of success stories — its homepage features accounts from members who married after meeting on the site, some going back to the mid-2000s. For a family that values a track record, that history is a real argument in ShiaMatch’s favour.',
        ],
      },
      {
        h2: 'How ShiaMatch works',
        p: [
          'The process on ShiaMatch is straightforward, and it has not changed much since the site was built. You create an online profile with your basic details. After completing it, you receive an email with a profile ID and password. To contact another member, you send them a request through ShiaMatch. If they like your profile, they accept the request, and both parties automatically receive each other’s email address. From that point on, you contact each other directly.',
          'Privacy works through that request system. ShiaMatch keeps your name and email address private, and passes them to other members only after you have accepted their request. The request system is anonymous until acceptance.',
          'What the site does not offer is equally clear from its homepage: there is no mention of a mobile app, no photo or ID verification system, no biodata maker, and no matchmaker accounts. Contact happens by email after a mutual request, and the rest of the process — checking who someone is, involving families, arranging a meeting — happens outside the site.',
        ],
      },
      {
        h2: 'What ShiaMatch costs',
        p: [
          'This is the difference most families notice first. ShiaMatch’s own homepage states: “ShiaMatch is 100% free for residents of all countries except for men residing in USA, UK or Canada. ShiaMatch is free for ladies of any country.”',
          'In other words, a man living in the United States, the United Kingdom, or Canada pays to use ShiaMatch, while women anywhere and men elsewhere do not. The site links to a page with more information about the charge; the homepage itself does not state the amount.',
          'ShiaRishta charges nobody, anywhere. There are no country-based charges for men or women, in the USA, UK, Canada, or any other country. Joining, browsing, and creating a profile are free.',
        ],
      },
      {
        h2: 'What ShiaRishta does differently',
        p: [
          'Free for everyone, everywhere. No charges based on country or gender. A man in the USA, UK, or Canada uses ShiaRishta free, where the same man pays on ShiaMatch.',
          'Verified profiles. ShiaRishta profiles carry photo and ID verification badges. Approving a government ID gives a gold “ID Verified” badge; approving a selfie gives a blue “Photo Verified” badge. ShiaMatch has no verification system — a profile there is taken on trust. Verification does not guarantee character, and families should still do their own checking, but it removes the most common fraud from the search before it starts.',
          'A free biodata maker. Most Shia families share a proposal as a biodata — a one-page summary of the person and their family. ShiaRishta includes a free biodata maker, and the biodata can be shared on WhatsApp, the format families already use. ShiaMatch has no equivalent tool.',
          'Matchmaker accounts. Matchmakers can submit profiles on behalf of the families they serve, with admin review. ShiaMatch is built around individuals creating their own profiles.',
          'Modern apps. ShiaRishta runs on the web and on iOS and Android. ShiaMatch is a website only, and its homepage does not advertise a mobile app.',
          'Wali involvement from the first introduction. ShiaRishta’s introduction process is built around family involvement and the wali’s role, rather than leaving the family to join the process after two people have already been talking privately.',
          'Search by marja and practice. Profiles can be filtered by marja and by practice — the questions Shia families ask first. ShiaMatch’s search is based on the basic profile details members enter.',
        ],
      },
      {
        h2: 'Comparison at a glance',
        p: [
          'Running since: ShiaMatch — 1999 (domain registered November 1999). ShiaRishta — a modern platform built for today’s Shia families.',
          'Cost for men in USA, UK, Canada: ShiaMatch — charged (per its homepage; amount not stated there). ShiaRishta — free.',
          'Cost for women, and for men elsewhere: ShiaMatch — free. ShiaRishta — free.',
          'Profile verification (photo and ID badges): ShiaMatch — not offered. ShiaRishta — yes, gold ID Verified and blue Photo Verified badges.',
          'Biodata maker: ShiaMatch — no. ShiaRishta — yes, free, shareable on WhatsApp.',
          'Matchmaker accounts: ShiaMatch — no. ShiaRishta — yes, with admin review.',
          'Mobile apps: ShiaMatch — none advertised. ShiaRishta — iOS and Android.',
          'Contact method: ShiaMatch — request system, then email after mutual acceptance. ShiaRishta — family-led introductions with wali involvement.',
          'Search filters: ShiaMatch — basic profile details. ShiaRishta — marja, practice, age, education, location.',
          'Success stories on homepage: ShiaMatch — yes, from members. ShiaRishta — member stories shared as the community grows.',
        ],
      },
      {
        h2: 'Who should use which?',
        p: [
          'ShiaMatch suits a family that values a long track record above all, is comfortable with email-based contact after a mutual request, and either does not fall under the charge (women anywhere, men outside the USA, UK, and Canada) or is happy to pay it.',
          'ShiaRishta suits a family that wants the search to be free regardless of where the man lives, wants profiles that have actually been verified, wants to share a proper biodata on WhatsApp, wants a matchmaker to be able to submit a profile, or wants to search from a phone app rather than a desktop website.',
          'Nothing stops a family using both. Many families do — they keep a profile on the older site for its pool of members and a profile on the newer one for its verification and tools. The honest advice is to try the free one first and see whether the profiles there are real and relevant to your family, because that costs nothing to find out.',
        ],
      },
      {
        h2: 'How to try ShiaRishta',
        p: [
          'Joining is free and takes a few minutes: create a free account, add your details, and start browsing verified profiles. If you already have a biodata, the biodata maker can turn it into a shareable format. If you are a matchmaker, you can create a matchmaker account and submit profiles for the families you serve.',
        ],
      },
    ],
    faq: [
      { q: 'Is ShiaRishta really free for men in the USA, UK, and Canada?', a: 'Yes. There are no country-based charges on ShiaRishta for men or women, in any country. This is the direct difference from ShiaMatch, which states on its homepage that it charges men residing in the USA, UK, or Canada.' },
      { q: 'Is ShiaMatch a bad site?', a: 'No. It has served the community since 1999, has a large pool of profiles, and publishes success stories from members who married after meeting there. The comparison on this page is about what each site offers, not about whether the older site is legitimate. It is legitimate; it is also dated, and it charges a group of users that ShiaRishta does not.' },
      { q: 'Can I keep my ShiaMatch profile and use ShiaRishta too?', a: 'Yes. There is no rule against using more than one platform, and many families do. A profile on each widens the search.' },
      { q: 'How is verification different from ShiaMatch?', a: 'ShiaMatch has no verification system: a profile is taken on trust, and contact details are exchanged after a mutual request. ShiaRishta verifies photo and government ID and shows badges on the profile, so a family can see that identity has been checked before the first introduction.' },
      { q: 'Does ShiaRishta have the same number of profiles as ShiaMatch?', a: 'ShiaMatch states on its homepage that it features thousands of profiles, built up since 1999. ShiaRishta is newer and its member base is still growing. The trade-off is between the size of the older pool and the verification, tools, and free access of the newer one — which is why many families use both.' },
    ],
  },
};

export function landingRouteSeo(meta = {}) {
  const out = {};
  for (const slug of Object.keys(LANDING_BODY)) {
    const body = LANDING_BODY[slug];
    const m = meta[slug] || {};
    out['/' + slug] = {
      title: m.title || body.h1,
      desc: m.desc || body.h1,
      h1: body.h1,
      lede: m.desc || body.h1,
      sections: body.sections || [{ h2: 'What this covers', p: [body.more] }],
      faq: body.faq || [],
    };
  }
  return out;
}

export const LANDING_SLUGS = Object.keys(LANDING_BODY);