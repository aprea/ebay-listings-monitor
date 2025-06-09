import cron from 'node-cron';
import eBayApi from 'ebay-api';
import { type components } from 'ebay-api/lib/types/restful/specs/buy_browse_v1_oas3.js';
import {
	Client,
	Events,
	GatewayIntentBits,
	TextChannel,
	EmbedBuilder,
} from 'discord.js';
import { db } from './src/db/index.js';
import { listingsTable } from './src/db/schema.js';

// Check for --seed argument
const isSeedMode = process.argv.includes('--seed');

// Initialize eBay client
const ebayClient = new eBayApi({
	appId: process.env.EBAY_PRODUCTION_CLIENT_ID || '',
	certId: process.env.EBAY_PRODUCTION_CLIENT_SECRET || '',
	endUserCtx: 'contextualLocation=country=AU,zip=2000',
	marketplaceId: eBayApi.MarketplaceId.EBAY_AU,
	sandbox: false,
});

// Initialize Discord client only if not in seed mode
const discordClient = isSeedMode
	? null
	: new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
			],
		});

// Start Discord bot only if not in seed mode
if (!isSeedMode && discordClient) {
	discordClient.login(process.env.DISCORD_BOT_SECRET);
}

let discordChannel: TextChannel | null = null;

const FOREIGN_SET_SYMBOLS = [
	// Sun and Moon era
	'sm1',
	'sm1+',
	'sm2',
	'sm2+',
	'sm4',
	'sm4+',
	'sm5',
	'sm5+',
	'sm6a',
	'sm6b',
	'sm7a',
	'sm7b',
	'sm8a',
	'sm8b',
	'sm9a',
	'sm9b',
	'sm10a',
	'sm10b',
	'sm11a',
	'sm11b',
	'sm12a',
	// Sword and Shield era
	's1a',
	's2a',
	's3a',
	's4a',
	's5a',
	's6a',
	's7r',
	's8a',
	's8b',
	's9a',
	's10a',
	's10b',
	's11a',
	's12a',
	// Scarlet and Violet era
	'sv1a',
	'sv1b',
	'sv1s',
	'sv2a',
	'sv2p',
	'sv3a',
	'sv4a',
	'sv4k',
	'sv5a',
	'sv5k',
	'sv5m',
	'sv6a',
	'sv7a',
	'sv8a',
	'sv9a',
	'sv10',
	'sv11b',
	'sv11w',
	// Miscellaneous
	'as2a',
	'as4a',
];

// Discord ready event (only if not in seed mode)
if (!isSeedMode && discordClient) {
	discordClient.once(Events.ClientReady, () => {
		console.log('Discord bot is ready!');
		// Get channel by ID
		const channel = discordClient.channels.cache.get('1378646860612505692');

		if (channel && channel instanceof TextChannel) {
			discordChannel = channel;
			console.log('Discord channel connected');

			// Schedule the monitoring task to run every minute
			const task = cron.schedule('* * * * *', monitorListings, {
				noOverlap: true,
			});

			// Run initial check now that Discord is ready
			console.log('Running initial check...');
			task.execute();
		} else {
			console.error('Discord channel not found');
		}
	});
}

// If in seed mode, run immediately
if (isSeedMode) {
	console.log('Running in seed mode - Discord notifications disabled');
	monitorListings()
		.then(() => {
			console.log('Seeding complete');
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}

// Get all processed listing IDs from database
async function getProcessedListingIds(): Promise<Set<string>> {
	const processedListings = await db
		.select({ itemId: listingsTable.itemId })
		.from(listingsTable);

	return new Set(processedListings.map((listing) => listing.itemId));
}

// Insert new listings into database (batch insert)
async function insertListings(itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) return;

	await db
		.insert(listingsTable)
		.values(itemIds.map((itemId) => ({ itemId })));
}

// Send Discord notification
async function sendDiscordNotification(
	item: components['schemas']['ItemSummary']
) {
	if (!discordChannel) {
		console.error('Discord channel not available');
		return;
	}

	const embed = new EmbedBuilder()
		.setTitle(item.title || 'Unknown Title')
		.setURL(item.itemWebUrl || '')
		.setColor(0x0099ff)
		.addFields(
			{
				name: 'Price',
				value: `$${item.price?.value || 'N/A'} ${item.price?.currency || 'AUD'}`,
				inline: true,
			},
			{
				name: 'Shipping',
				value: item.shippingOptions?.[0]?.shippingCost?.value
					? `$${item.shippingOptions[0].shippingCost.value} ${item.shippingOptions[0].shippingCost.currency || 'AUD'}`
					: 'See listing',
				inline: true,
			},
			{
				name: 'Total Price',
				value: `$${calculateTotalPrice(item)} AUD`,
				inline: true,
			}
		)
		.setTimestamp();

	// Add thumbnail image if available
	if (item.thumbnailImages?.[0]?.imageUrl) {
		embed.setThumbnail(item.thumbnailImages[0].imageUrl);
	} else if (item.image?.imageUrl) {
		embed.setThumbnail(item.image.imageUrl);
	}

	await discordChannel.send({ embeds: [embed] });
}

// Calculate total price including shipping
function calculateTotalPrice(
	item: components['schemas']['ItemSummary']
): string {
	const itemPrice = parseFloat(item.price?.value || '0');
	const shippingPrice = parseFloat(
		item.shippingOptions?.[0]?.shippingCost?.value || '0'
	);
	return (itemPrice + shippingPrice).toFixed(2);
}

// Main monitoring function
async function monitorListings() {
	console.log(`[${new Date().toISOString()}] Checking for new listings...`);

	try {
		// Fetch all processed item IDs once at the start
		const processedIds = await getProcessedListingIds();
		console.log(`Already tracking ${processedIds.size} listings`);

		const foreignSetSymbolsExclusions = FOREIGN_SET_SYMBOLS.map(
			(symbol) => `-${symbol}`
		).join(' ');

		const listings = (await ebayClient.buy.browse.search({
			limit: '200',
			q: `(Pokémon, Pokemon) booster box -japanese -japan -jp -empty -korean -etb -metazoo -thai -chinese -equivalent -collection -bundle -"elite trainer box" -"high class" -sticker -stickers -"ex box" -tin -blister -opened -unsealed -used -"uk exclusive" -"vstar universe" -"half booster box" ${foreignSetSymbolsExclusions}`,
			sort: 'newlyListed',
			filter: 'buyingOptions:{FIXED_PRICE|BEST_OFFER},itemLocationCountry:AU,price:[200..350],priceCurrency:AUD',
		})) as components['schemas']['SearchPagedCollection'];

		if (!listings.itemSummaries || listings.itemSummaries.length === 0) {
			console.log('No listings found');
			return;
		}

		console.log(`Found ${listings.itemSummaries.length} listings`);

		// Collect new listings to process
		const newListings: components['schemas']['ItemSummary'][] = [];

		for (const item of listings.itemSummaries) {
			if (!item.itemId) continue;

			// Skip sellers with feedback below 95%
			const feedbackPercentage = item.seller?.feedbackPercentage
				? parseFloat(item.seller.feedbackPercentage)
				: 0;

			if (feedbackPercentage < 95) {
				console.log(
					`Skipping listing from seller with ${feedbackPercentage}% feedback: ${item.title}`
				);
				continue;
			}

			// Check if we've already processed this listing using Set lookup (O(1))
			if (!processedIds.has(item.itemId)) {
				newListings.push(item);
			}
		}

		console.log(`${newListings.length} new listings to process`);

		if (newListings.length === 0) return;

		// Batch insert all new listings into database
		const newItemIds = newListings.map((item) => item.itemId!);
		await insertListings(newItemIds);

		// Send Discord notifications for each new listing
		for (const item of newListings) {
			console.log(`New listing found: ${item.title} (${item.itemId})`);
			// Skip notifications in seed mode
			if (!isSeedMode) {
				await sendDiscordNotification(item);
			}
		}

		if (isSeedMode) {
			console.log(`Seeded ${newListings.length} listings into database`);
		}
	} catch (error) {
		console.error('Error in monitoring cycle:', error);
	}
}
