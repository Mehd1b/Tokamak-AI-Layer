/**
 * Infer the trading horizon from a natural language prompt.
 * Returns undefined if no recognizable time reference is found.
 *
 * Examples:
 *   "Invest $100k for the next 6 months"  → "6m"
 *   "Buy tokens for a year"               → "1y"
 *   "Quick trade for 4 hours"             → "4h"
 */
export function inferHorizonFromPrompt(prompt) {
    const text = prompt.toLowerCase();
    // Match patterns like "6 months", "1 year", "4 hours", "1 week", "3m", "1y"
    // Also match written-out numbers: "six months", "one year", etc.
    const wordToNum = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
        seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
        a: 1, an: 1,
    };
    // Try explicit duration patterns first: "N months/weeks/days/hours/year(s)"
    const durationRegex = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a|an)\s*(?:-\s*)?(month|week|day|hour|year)s?/g;
    let match;
    const candidates = [];
    while ((match = durationRegex.exec(text)) !== null) {
        const rawNum = match[1];
        const unit = match[2];
        const num = wordToNum[rawNum] ?? parseInt(rawNum, 10);
        if (isNaN(num))
            continue;
        const horizon = mapToHorizon(num, unit);
        if (horizon) {
            candidates.push({ horizon, index: match.index });
        }
    }
    // Also try shorthand patterns: "6m", "1y", "1w", "4h", "1d"
    const shorthandRegex = /\b(\d+)\s*([hdwmy])\b/g;
    while ((match = shorthandRegex.exec(text)) !== null) {
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const mapped = mapShorthand(num, unit);
        if (mapped) {
            candidates.push({ horizon: mapped, index: match.index });
        }
    }
    // Also match phrases like "long-term", "short-term"
    if (candidates.length === 0) {
        if (/long[\s-]?term|multi[\s-]?year/i.test(text)) {
            return "1y";
        }
        if (/medium[\s-]?term/i.test(text)) {
            return "3m";
        }
        if (/short[\s-]?term/i.test(text)) {
            return "1w";
        }
    }
    // Return the first matched horizon, or undefined if none found
    return candidates[0]?.horizon;
}
function mapToHorizon(num, unit) {
    switch (unit) {
        case "hour":
            if (num <= 1)
                return "1h";
            if (num <= 4)
                return "4h";
            return "1d"; // > 4 hours → treat as 1 day
        case "day":
            if (num <= 1)
                return "1d";
            if (num <= 7)
                return "1w";
            return "1m"; // > 7 days → treat as 1 month
        case "week":
            if (num <= 1)
                return "1w";
            if (num <= 4)
                return "1m";
            return "3m"; // > 4 weeks → treat as 3 months
        case "month":
            if (num <= 1)
                return "1m";
            if (num <= 3)
                return "3m";
            if (num <= 6)
                return "6m";
            return "1y"; // > 6 months → treat as 1 year
        case "year":
            return "1y";
        default:
            return undefined;
    }
}
function mapShorthand(num, unit) {
    switch (unit) {
        case "h":
            return mapToHorizon(num, "hour");
        case "d":
            return mapToHorizon(num, "day");
        case "w":
            return mapToHorizon(num, "week");
        case "m":
            return mapToHorizon(num, "month");
        case "y":
            return "1y";
        default:
            return undefined;
    }
}
/**
 * Infer the risk tolerance from a natural language prompt.
 * Returns undefined if no recognizable risk preference is found.
 *
 * Examples:
 *   "invest aggressively"          → "aggressive"
 *   "safe low-risk investment"     → "conservative"
 *   "moderate risk"                → "moderate"
 */
export function inferRiskToleranceFromPrompt(prompt) {
    const text = prompt.toLowerCase();
    // Aggressive keywords
    if (/\b(aggressive|aggresive|high[\s-]?risk|risky|yolo|degen|max[\s-]?risk|maximum[\s-]?risk)\b/.test(text)) {
        return "aggressive";
    }
    // Conservative keywords
    if (/\b(conservative|conservat|low[\s-]?risk|safe|cautious|minimal[\s-]?risk|low[\s-]?volatility|risk[\s-]?averse)\b/.test(text)) {
        return "conservative";
    }
    // Moderate keywords (explicit only — don't default to moderate here)
    if (/\b(moderate|medium[\s-]?risk|balanced|middle[\s-]?ground)\b/.test(text)) {
        return "moderate";
    }
    return undefined;
}
//# sourceMappingURL=horizonParser.js.map