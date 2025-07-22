const cheerio = require('cheerio');
const { Buffer } = require('buffer');
const utils = require('./utils');

const httpClient = utils.getHttpClient();

// ===== HELPER FUNCTIONS =====

/**
 * Extracts value from a settled promise, returning a default value if rejected.
 * @param {object} settledPromise - The result from Promise.allSettled.
 * @param {*} defaultValue - The value to return if the promise was rejected.
 * @returns {*} The fulfilled value or the default value.
 */
const getSettledValue = (settledPromise, defaultValue) => {
  if (settledPromise.status === 'fulfilled') {
    return settledPromise.value || defaultValue;
  }
  console.warn('A scraping promise was rejected:', settledPromise.reason?.message || 'Unknown error');
  return defaultValue;
};


// ===== SCRAPING SERVICES =====

const scrapers = {
  /**
   * Scrapes the details of a specific anime.
   * @param {string} slug - The anime slug.
   * @param {string} sourceUrl - The base URL of the source website.
   * @param {string} apiBaseUrl - The base URL of this API for constructing links.
   * @returns {Promise<object>} A promise that resolves to the anime details.
   */
  async getAnimeDetails(slug, sourceUrl, apiBaseUrl) {
    const url = utils.buildUrl(sourceUrl, `/anime/${slug}`);
    try {
      const response = await utils.retryRequest(() => httpClient.get(url));
      const $ = cheerio.load(response.data);
      const main = $('.venser');

      if (main.length === 0) throw new Error('Anime not found (page structure mismatch)');
      
      const [basicInfo, episodes, recommendations] = await Promise.allSettled([
        this.extractBasicInfo($, main),
        this.extractEpisodes($, main, apiBaseUrl),
        this.extractRecommendations($, apiBaseUrl)
      ]);

      const result = {
        ...getSettledValue(basicInfo, {}),
        episodes: getSettledValue(episodes, []),
        recommendations: getSettledValue(recommendations, [])
      };

      if (!result.title) throw new Error('Anime not found (title could not be extracted)');

      return result;
    } catch (error) {
      console.error(`Error in getAnimeDetails for slug "${slug}":`, error.message);
      throw error;
    }
  },

  /**
   * Extracts basic information of an anime from the page.
   * @param {cheerio.CheerioAPI} $ - The Cheerio instance.
   * @param {cheerio.Cheerio<cheerio.Element>} main - The main content element.
   * @returns {Promise<object>} A promise that resolves to the basic info.
   */
  async extractBasicInfo($, main) {
    const info = {
      title: main.find('.jdlrx h1').text().trim(),
      poster: main.find('.fotoanime img').attr('src') || null,
      synopsis: main.find('.sinopc').text().trim() || 'No synopsis available.'
    };
    
    main.find('.infozingle p').each((_, el) => {
      const key = $(el).find('b').text().replace(':', '').trim().toLowerCase().replace(/\s+/g, '_');
      const val = $(el).text().replace(/^[^:]+:\s*/i, '').trim();
      
      if (key === 'genre') {
        info.genres = $(el).find('a').map((_, g) => $(g).text().trim()).get();
      } else if (key && val) {
        info[key] = val;
      }
    });
    return info;
  },

  /**
   * Extracts the list of episodes for an anime.
   * @param {cheerio.CheerioAPI} $ - The Cheerio instance.
   * @param {cheerio.Cheerio<cheerio.Element>} main - The main content element.
   * @param {string} apiBaseUrl - The base URL of this API.
   * @returns {Promise<Array<object>>} A promise that resolves to a list of episodes.
   */
  async extractEpisodes($, main, apiBaseUrl) {
    const episodes = main.find('.episodelist ul li').map((_, li) => {
      const link = $(li).find('a');
      const epSlug = utils.parseSlugFromLink(link.attr('href'), 'episode');
      if (!epSlug) return null;
      
      return {
        title: link.text().trim(),
        slug: epSlug,
        link: utils.buildUrl(apiBaseUrl, `/episode/${epSlug}`),
        date: $(li).find('.zeebr').text().trim() || null
      };
    }).get().filter(Boolean);
    
    return episodes.reverse(); // Show latest episode first
  },
  
    /**
   * Extracts a list of recommended anime.
   * @param {cheerio.CheerioAPI} $ - The Cheerio instance.
   * @param {string} apiBaseUrl - The base URL of this API.
   * @returns {Promise<Array<object>>} A promise that resolves to a list of recommendations.
   */
  async extractRecommendations($, apiBaseUrl) {
    return $('#recommend-anime-series .isi-anime').map((_, div) => {
      const link = $(div).find('.judul-anime a');
      const recSlug = utils.parseSlugFromLink(link.attr('href'), 'anime');
      if (!recSlug) return null;

      return {
        title: link.text().trim(),
        slug: recSlug,
        link: utils.buildUrl(apiBaseUrl, `/anime/${recSlug}`),
        image: $(div).find('img').attr('src') || null
      };
    }).get().filter(Boolean);
  },

  /**
   * Scrapes a generic list of anime (e.g., ongoing, completed).
   * @param {string} path - The path on the source website (e.g., 'ongoing-anime').
   * @param {string} sourceUrl - The base URL of the source website.
   * @param {string} apiBaseUrl - The base URL of this API.
   * @returns {Promise<Array<object>>} A list of anime.
   */
  async getAnimeList(path, sourceUrl, apiBaseUrl) {
    const url = utils.buildUrl(sourceUrl, `/${path}/`);
    try {
      const response = await utils.retryRequest(() => httpClient.get(url));
      const $ = cheerio.load(response.data);
      
      return $('.venz ul li').map((_, el) => {
        const titleEl = $(el).find('.jdlflm');
        const link = $(el).find('a').attr('href');
        const slug = utils.parseSlugFromLink(link, 'anime');
        
        if (!titleEl.text() || !slug) return null;

        return {
          title: titleEl.text().trim(),
          slug,
          image: $(el).find('img').attr('src') || null,
          link: utils.buildUrl(apiBaseUrl, `/anime/${slug}`),
          episodes: $(el).find('.epz').text().trim() || 'N/A',
          score: $(el).find('.epztipe').text().trim() || 'N/A',
          date: $(el).find('.newnime').text().trim() || 'N/A'
        };
      }).get().filter(Boolean);
    } catch (error) {
      console.error(`Error in getAnimeList for path "${path}":`, error.message);
      throw error;
    }
  },

  /**
   * Searches for anime based on a query.
   * @param {string} query - The search term.
   * @param {string} sourceUrl - The base URL of the source website.
   * @param {string} apiBaseUrl - The base URL of this API.
   * @returns {Promise<Array<object>>} A list of search results.
   */
  async searchAnime(query, sourceUrl, apiBaseUrl) {
    const url = `${sourceUrl}/?s=${encodeURIComponent(query)}&post_type=anime`;
    try {
      const response = await utils.retryRequest(() => httpClient.get(url));
      const $ = cheerio.load(response.data);
      
      return $('ul.chivsrc > li').map((_, el) => {
        const linkEl = $(el).find('h2 a');
        const slug = utils.parseSlugFromLink(linkEl.attr('href'), 'anime');
        if (!slug || !linkEl.text()) return null;

        return {
          title: linkEl.text().trim(),
          slug,
          link: utils.buildUrl(apiBaseUrl, `/anime/${slug}`),
          image: $(el).find('img').attr('src') || null,
          genres: $(el).find('.set').first().find('a').map((_, g) => $(g).text().trim()).get(),
          status: $(el).find('.set').eq(1).text().replace('Status :', '').trim() || 'Unknown',
          rating: $(el).find('.set').eq(2).text().replace('Rating :', '').trim() || 'N/A'
        };
      }).get().filter(Boolean);
    } catch (error) {
      console.error(`Error in searchAnime for query "${query}":`, error.message);
      throw error;
    }
  },

  async getOngoingAnime(sourceUrl, apiBaseUrl) {
    return this.getAnimeList('ongoing-anime', sourceUrl, apiBaseUrl);
  },

  async getCompletedAnime(sourceUrl, apiBaseUrl) {
    return this.getAnimeList('complete-anime', sourceUrl, apiBaseUrl);
  },
  
  /**
   * Scrapes the streaming links for a specific episode.
   * @param {string} slug - The episode slug.
   * @param {string} sourceUrl - The base URL of the source website.
   * @returns {Promise<object>} An object containing streaming links.
   */
  async getEpisodeStreaming(slug, sourceUrl) {
    const url = utils.buildUrl(sourceUrl, `/episode/${slug}`);
    try {
      const response = await utils.retryRequest(() => httpClient.get(url));
      const $ = cheerio.load(response.data);

      const title = $('.venutama h1').first().text().trim();
      if (!title) throw new Error('Episode not found');

      const [nonce, mirrorLinks, downloadLinks] = await Promise.allSettled([
        this.getNonce(sourceUrl),
        this.extractMirrorLinks($, sourceUrl, slug),
        this.extractDownloadLinks($)
      ]);

      return {
        title,
        iframe: $('iframe').first().attr('src') || null,
        mirrors: getSettledValue(mirrorLinks, []),
        downloads: getSettledValue(downloadLinks, {})
      };
    } catch (error) {
      console.error(`Error in getEpisodeStreaming for slug "${slug}":`, error.message);
      throw error;
    }
  },

  /**
   * Retrieves the nonce required for making streaming link requests.
   * @param {string} sourceUrl - The base URL of the source website.
   * @returns {Promise<string|null>} The nonce value.
   */
  async getNonce(sourceUrl) {
    try {
      const { data } = await httpClient.post(
        `${sourceUrl}/wp-admin/admin-ajax.php`,
        new URLSearchParams({ action: 'aa1208d27f29ca340c92c66d1926f13f' }),
        { headers: { 'x-requested-with': 'XMLHttpRequest', 'origin': sourceUrl } }
      );
      return data?.data || null;
    } catch (error) {
      console.warn('Failed to get nonce:', error.message);
      return null;
    }
  },
  
  /**
   * Extracts and processes mirror streaming links from the episode page.
   * @param {cheerio.CheerioAPI} $ - The Cheerio instance.
   * @param {string} sourceUrl - The base URL of the source website.
   * @param {string} slug - The episode slug.
   * @returns {Promise<Array<object>>} A list of mirror links by quality.
   */
  async extractMirrorLinks($, sourceUrl, slug) {
    const nonce = await this.getNonce(sourceUrl);
    if (!nonce) return [];

    const mirrorsByQuality = {};
    const qualityPromises = [];

    $('.mirrorstream .tabs li a').each((_, tab) => {
        const quality = $(tab).text().trim(); // e.g., 360p, 480p
        const targetId = $(tab).attr('href'); // e.g., #m360p

        const linkPromises = $(targetId + ' ul li a').map(async (_, el) => {
            const content = $(el).data('content');
            if (!content) return null;
            const url = await this.fetchIframeUrl(content, nonce, sourceUrl, slug);
            return { name: $(el).text().trim(), url };
        }).get();
        
        qualityPromises.push(
            Promise.all(linkPromises).then(links => {
                mirrorsByQuality[quality] = links.filter(Boolean);
            })
        );
    });

    await Promise.all(qualityPromises);
    return mirrorsByQuality;
  },

  /**
   * Extracts download links from the episode page.
   * @param {cheerio.CheerioAPI} $ - The Cheerio instance.
   * @returns {Promise<object>} An object with download links grouped by quality.
   */
  async extractDownloadLinks($) {
    const downloads = {};
    $('.download ul li').each((_, li) => {
      const quality = $(li).find('strong').text().trim();
      if (!quality) return;

      downloads[quality] = $(li).find('a').map((_, a) => ({
        provider: $(a).text().trim(),
        url: $(a).attr('href')
      })).get();
    });
    return downloads;
  },
  
  /**
   * Fetches the final iframe URL for a streaming mirror.
   * @param {string} content - The base64 encoded content.
   * @param {string} nonce - The nonce value.
   * @param {string} sourceUrl - The base URL of the source website.
   * @param {string} slug - The episode slug for the referer header.
   * @returns {Promise<string|null>} The final streaming URL.
   */
  async fetchIframeUrl(content, nonce, sourceUrl, slug) {
    try {
      const payload = JSON.parse(Buffer.from(content, 'base64').toString('utf-8'));
      const body = new URLSearchParams({
        ...payload,
        nonce,
        action: '2a3505c93b0035d3f455df82bf976b84',
      });

      const { data } = await httpClient.post(
        `${sourceUrl}/wp-admin/admin-ajax.php`,
        body.toString(),
        {
          headers: {
            'x-requested-with': 'XMLHttpRequest',
            'origin': sourceUrl,
            'referer': utils.buildUrl(sourceUrl, `/episode/${slug}`),
          },
        }
      );

      if (!data?.data) return null;
      
      const html = Buffer.from(data.data, 'base64').toString('utf-8');
      const match = html.match(/src="([^"]+)"/);
      return match ? match[1] : null;
    } catch (error) {
      console.warn('Failed to fetch iframe URL:', error.message);
      return null;
    }
  }
};

module.exports = scrapers;