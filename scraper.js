const cheerio = require('cheerio');
const { Buffer } = require('buffer');
const utils = require('./utils');

const httpClient = utils.getHttpClient();

// ===== SCRAPING SERVICES =====
const scrapers = {
  // Search anime with optimized parsing
  async searchAnime(query, baseUrl) {
    const url = `https://otakudesu.cloud/?s=${encodeURIComponent(query)}&post_type=anime`;
    const { data: html } = await httpClient.get(url);
    const $ = cheerio.load(html);
    
    const results = [];
    const promises = [];

    $('ul.chivsrc > li').each((i, el) => {
      promises.push(new Promise((resolve) => {
        try {
          const $el = $(el);
          const title = $el.find('h2 a').text().trim();
          const link = $el.find('h2 a').attr('href');
          const slug = utils.parseSlugFromLink(link);
          
          if (!slug || !title) {
            resolve(null);
            return;
          }

          const genres = [];
          $el.find('.set').first().find('a').each((_, g) => {
            genres.push($(g).text().trim());
          });

          const status = $el.find('.set').eq(1).text().replace('Status :', '').trim();
          const rating = $el.find('.set').eq(2).text().replace('Rating :', '').trim();
          const image = $el.find('img').attr('src') || null;

          resolve({
            title,
            slug,
            link: `${baseUrl}/anime/${slug}`,
            image,
            genres,
            status,
            rating: rating || 'N/A'
          });
        } catch (err) {
          resolve(null);
        }
      }));
    });

    const rawResults = await Promise.all(promises);
    return rawResults.filter(result => result !== null);
  },

  // Get ongoing anime list
  async getOngoingAnime(baseUrl) {
    const url = 'https://otakudesu.cloud/ongoing-anime/';
    const { data: html } = await httpClient.get(url);
    const $ = cheerio.load(html);
    
    const results = [];
    $('.venz ul li').each((_, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const image = $el.find('img').attr('src');
      const link = $el.find('a').attr('href');
      const slug = link?.split('/anime/')[1]?.replace('/', '');
      const episodes = $el.find('.epz').text().trim();
      const score = $el.find('.epztipe').text().trim();
      const date = $el.find('.newnime').text().trim();

      if (title && slug) {
        results.push({
          title,
          slug,
          image: image || null,
          link: `${baseUrl}/anime/${slug}`,
          episodes: episodes || 'N/A',
          score: score || 'N/A',
          date: date || 'N/A'
        });
      }
    });

    return results;
  },

  // Get completed anime list
  async getCompletedAnime(baseUrl) {
    const url = 'https://otakudesu.cloud/complete-anime/';
    const { data: html } = await httpClient.get(url);
    const $ = cheerio.load(html);
    
    const results = [];
    $('.venz ul li').each((_, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const image = $el.find('img').attr('src');
      const link = $el.find('a').attr('href');
      const slug = link?.split('/anime/')[1]?.replace('/', '');
      const episodes = $el.find('.epz').text().trim();
      const score = $el.find('.epztipe').text().trim();
      const date = $el.find('.newnime').text().trim();

      if (title && slug) {
        results.push({
          title,
          slug,
          image: image || null,
          link: `${baseUrl}/anime/${slug}`,
          episodes: episodes || 'N/A',
          score: score || 'N/A',
          date: date || 'N/A'
        });
      }
    });

    return results;
  },

  // Get anime details with parallel processing
  async getAnimeDetails(slug, baseUrl) {
    const url = `https://otakudesu.cloud/anime/${slug}`;
    const { data: html } = await httpClient.get(url);
    const $ = cheerio.load(html);
    const main = $('.venser');

    // Parallel extraction
    const [basicInfo, episodes, recommendations] = await Promise.all([
      this.extractBasicInfo($, main),
      this.extractEpisodes($, main, baseUrl),
      this.extractRecommendations($, baseUrl)
    ]);

    return { ...basicInfo, episodes, recommendations };
  },

  // Extract basic anime info
  async extractBasicInfo($, main) {
    const title = main.find('.jdlrx h1').text().trim();
    const poster = main.find('.fotoanime img').attr('src') || null;
    const synopsis = main.find('.sinopc').text().trim();

    const info = { title, poster, synopsis };
    
    main.find('.infozingle p').each((_, el) => {
      const $el = $(el);
      const key = $el.find('b').text().replace(':', '').trim().toLowerCase();
      const val = $el.text().replace(/^[^:]+:\s*/i, '').trim();

      if (key === 'genre') {
        info.genres = [];
        $el.find('a').each((_, g) => {
          info.genres.push($(g).text().trim());
        });
      } else if (key && val) {
        info[key] = val;
      }
    });

    return info;
  },

  // Extract episodes list
  async extractEpisodes($, main, baseUrl) {
    const episodes = [];
    
    main.find('.episodelist ul li').each((_, li) => {
      const $li = $(li);
      const epLink = $li.find('a').attr('href');
      const epTitle = $li.find('a').text().trim();
      const date = $li.find('.zeebr').text().trim();
      
      if (epLink && epTitle) {
        const epSlug = epLink.split('/').filter(Boolean).pop();
        episodes.push({
          title: epTitle,
          slug: epSlug,
          link: `${baseUrl}/episode/${epSlug}`,
          date: date || null
        });
      }
    });

    return episodes.reverse(); // Latest first
  },

  // Extract recommendations
  async extractRecommendations($, baseUrl) {
    const recommendations = [];
    
    $('#recommend-anime-series .isi-anime').each((_, div) => {
      const $div = $(div);
      const recLink = $div.find('.judul-anime a').attr('href');
      const recSlug = utils.parseSlugFromLink(recLink);
      const title = $div.find('.judul-anime a').text().trim();
      const image = $div.find('img').attr('src');
      
      if (recSlug && title) {
        recommendations.push({
          title,
          slug: recSlug,
          link: `${baseUrl}/anime/${recSlug}`,
          image: image || null
        });
      }
    });

    return recommendations;
  },

  // Episode streaming links with enhanced error handling
  async getEpisodeStreaming(slug, baseUrl) {
    try {
      const [nonce, episodeData] = await Promise.all([
        this.getNonce(),
        this.getEpisodeBasicData(slug)
      ]);

      const mirrorUrls = await this.processMirrorLinks(episodeData.mirrorRaw, nonce, slug);
      
      return {
        title: episodeData.title,
        iframe: episodeData.mainIframe,
        mirror: mirrorUrls,
        download: episodeData.download
      };
    } catch (error) {
      throw new Error(`Failed to get episode streaming: ${error.message}`);
    }
  },

  // Get nonce for streaming requests
  async getNonce() {
    const { data } = await httpClient.post(
      'https://otakudesu.cloud/wp-admin/admin-ajax.php',
      new URLSearchParams({ action: 'aa1208d27f29ca340c92c66d1926f13f' }),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'origin': 'https://otakudesu.cloud',
          'referer': 'https://otakudesu.cloud/',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      }
    );
    return data?.data;
  },

  // Get basic episode data
  async getEpisodeBasicData(slug) {
    const url = `https://otakudesu.cloud/episode/${slug}/`;
    const { data: html } = await httpClient.get(url);
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim();
    const mainIframe = $('iframe').first().attr('src') || null;

    // Extract mirror links
    const mirrorRaw = { m360p: [], m480p: [], m720p: [] };
    ['m360p', 'm480p', 'm720p'].forEach((quality) => {
      $(`.mirrorstream ul.${quality} li a`).each((_, el) => {
        const $el = $(el);
        const nama = $el.text().trim().toLowerCase();
        const content = $el.attr('data-content')?.trim();
        if (content && nama) {
          mirrorRaw[quality].push({ nama, content });
        }
      });
    });

    // Extract download links
    const download = {};
    $('.download ul li').each((_, li) => {
      const $li = $(li);
      const quality = $li.find('strong').text().trim().toLowerCase();
      if (quality) {
        download[quality] = [];
        $li.find('a').each((_, a) => {
          const $a = $(a);
          const nama = $a.text().trim();
          const href = $a.attr('href');
          if (href && nama) {
            download[quality].push({ nama, href });
          }
        });
      }
    });

    return { title, mainIframe, mirrorRaw, download };
  },

  // Process mirror links for streaming
  async processMirrorLinks(mirrorRaw, nonce, slug) {
    const mirror = { m360p: [], m480p: [], m720p: [] };
    
    for (const quality of Object.keys(mirrorRaw)) {
      const promises = mirrorRaw[quality].map(async (m) => {
        try {
          const payload = JSON.parse(Buffer.from(m.content, 'base64').toString('utf-8'));
          const url = await this.fetchIframeUrl(payload, nonce, slug);
          return { nama: m.nama, url };
        } catch (error) {
          console.warn(`Failed to process mirror ${m.nama}:`, error.message);
          return { nama: m.nama, url: null };
        }
      });

      mirror[quality] = await Promise.all(promises);
    }

    return mirror;
  },

  // Fetch iframe URL for streaming
  async fetchIframeUrl(payload, nonce, slug) {
    const body = new URLSearchParams({
      ...payload,
      nonce,
      action: '2a3505c93b0035d3f455df82bf976b84',
    });

    const { data } = await httpClient.post(
      'https://otakudesu.cloud/wp-admin/admin-ajax.php',
      body.toString(),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'origin': 'https://otakudesu.cloud',
          'referer': `https://otakudesu.cloud/episode/${slug}`,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      }
    );

    if (!data?.data) return null;
    
    const html = Buffer.from(data.data, 'base64').toString('utf-8');
    const match = html.match(/src="([^"]+)"/);
    return match ? match[1] : null;
  }
};

module.exports = scrapers;