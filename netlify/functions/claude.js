exports.handler = async function (event) {
  // Easy browser test:
  // Opening /.netlify/functions/claude should return this message.
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "Claude Netlify Function is running"
      })
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Allow": "GET, POST"
      },
      body: JSON.stringify({
        error: "Method not allowed"
      })
    };
  }

  try {
    let requestBody;

    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Invalid JSON request"
        })
      };
    }

    const prompt =
      typeof requestBody.prompt === "string"
        ? requestBody.prompt.trim()
        : "";

    if (!prompt) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Prompt is required"
        })
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is missing in Netlify.");

      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error:
            "ANTHROPIC_API_KEY is not configured in Netlify environment variables."
        })
      };
    }

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      }
    );

    const rawResponse = await response.text();

    let data;

    try {
      data = rawResponse ? JSON.parse(rawResponse) : {};
    } catch (error) {
      console.error(
        "Anthropic returned non-JSON:",
        response.status,
        rawResponse
      );

      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Anthropic returned an invalid response."
        })
      };
    }

    if (!response.ok) {
      console.error(
        "Anthropic API error:",
        response.status,
        data
      );

      const apiMessage =
        data?.error?.message ||
        `Anthropic API request failed (${response.status}).`;

      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: apiMessage
        })
      };
    }

    const text = Array.isArray(data?.content)
      ? data.content
          .filter(
            item =>
              item?.type === "text" &&
              typeof item.text === "string"
          )
          .map(item => item.text)
          .join("")
          .trim()
      : "";

    if (!text) {
      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Anthropic returned an empty response."
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text
      })
    };

  } catch (error) {
    console.error("Claude Netlify Function error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error:
          error?.message ||
          "Internal server error"
      })
    };
  }
};