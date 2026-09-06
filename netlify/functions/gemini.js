exports.handler = async function (event) {

  // Browser test
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "Gemini Netlify Function is running"
      })
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Method not allowed"
      })
    };
  }

  try {

    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "GEMINI_API_KEY is not configured in Netlify."
        })
      };
    }

    let body;

    try {
      body =
        JSON.parse(
          event.body || "{}"
        );
    } catch (error) {

      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid JSON request."
        })
      };

    }

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    if (!prompt) {

      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Prompt is required."
        })
      };

    }

    const response =
      await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify({
            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data =
        raw
          ? JSON.parse(raw)
          : {};
    } catch (error) {

      console.error(
        "Gemini invalid response:",
        raw
      );

      return {
        statusCode: 502,

        body: JSON.stringify({
          error:
            "Gemini returned an invalid response."
        })
      };
    }

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        response.status,
        data
      );

      return {
        statusCode:
          response.status,

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          error:
            data?.error?.message ||
            `Gemini request failed (${response.status})`
        })
      };

    }

    const text =
      data?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(
          part =>
            part.text || ""
        )
        .join("")
        .trim();

    if (!text) {

      console.error(
        "Gemini returned no text:",
        data
      );

      return {
        statusCode: 502,

        body: JSON.stringify({
          error:
            "Gemini returned an empty response."
        })
      };

    }

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        text: text
      })
    };

  } catch (error) {

    console.error(
      "Gemini function error:",
      error
    );

    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        error:
          error.message ||
          "Internal server error"
      })
    };

  }

};