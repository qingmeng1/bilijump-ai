package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/imroc/req/v3"
	"github.com/tidwall/gjson"
	"log"
	"net/http"
	"regexp"
	"strconv"
)

const (
	apiKey     = "sk-NHzvSvB3mlURA8Md97FAAAAAAeB44402Bb86C904EAAAAAA"
	apiURL     = "https://www.openai.com/v1/chat/completions"
	apiModel   = "gpt-4o"
	biliCookie = "SESSDATA=763281f5%2C1751119580%2Cd954e%2A31CjB5ZRe6-7LtFGjYtixyA7wBnxyf_AAAAAAA_tVu_tGxiuklLMPEGqikAT7XDlRsSVkVhbVBGekFuTVk1SWxVXzRvY3gyeWpZbW9hZHAyRkJiM1o0UFpzY2VGTi1KRVhDX3VFcmJNUnhaM3JpNGJsWFZBaDQ4OTNJbnZpZURVNFJLOFUtWTRRIIEC;"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float32   `json:"temperature"`
}

type ChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func main() {
	http.HandleFunc("/adtime", handleAdTime)

	if err := http.ListenAndServe(":8181", nil); err != nil {
		panic(err)
	}
}

func handleAdTime(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bvid := r.URL.Query().Get("bvid")
	if bvid == "" {
		http.Error(w, "Missing bvid parameter", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	response := adRecognition(bvid)
	log.Printf("bvid: %s, adtime：%v\n", bvid, response)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func adRecognition(bvid string) []string {
	client := req.NewClient()
	client.ImpersonateChrome()
	client.SetTLSFingerprintChrome()
	client.SetCommonHeader("origin", "https://www.bilibili.com")
	client.SetCommonHeader("cookie", biliCookie)
	defer client.CloseIdleConnections()

	//bvid := "BV1vLAkeCE4i"

	response := client.R().MustGet("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid)
	defer response.Body.Close()
	aid := gjson.Get(response.String(), "data.aid").String()
	cid := gjson.Get(response.String(), "data.cid").String()

	response = client.R().MustGet("https://api.bilibili.com/x/player/wbi/v2?aid=" + aid + "&cid=" + cid)
	defer response.Body.Close()
	subtitle_url := gjson.Get(response.String(), "data.subtitle.subtitles.0.subtitle_url").String()

	//log.Println(subtitle_url)
	if subtitle_url == "" {
		log.Println("subtitle is empty.")
		return nil
	}

	response = client.R().MustGet("https:" + subtitle_url)
	defer response.Body.Close()

	//subtitle_url := gjson.Get(response.String(), "body.#").Int()

	subtitle := ""
	for i := 0; i < int(gjson.Get(response.String(), "body.#").Int()); i++ {
		from := gjson.Get(response.String(), "body."+strconv.Itoa(i)+".from").String()
		to := gjson.Get(response.String(), "body."+strconv.Itoa(i)+".to").String()
		content := gjson.Get(response.String(), "body."+strconv.Itoa(i)+".content").String()
		subtitle += fmt.Sprintf("%s --> %s\n%s\n", from, to, content)
	}

	//log.Println(subtitle)

	resp := OpenAI(subtitle)
	log.Printf("ad time: %s\n", resp)
	re := regexp.MustCompile(`\d+(?:\.\d+)?|\.\d+`)
	airesp := re.FindAllString(resp, -1)
	if len(airesp) < 2 {
		airesp = []string{}
	}
	return airesp
}

func OpenAI(message string) string {
	requestData := ChatRequest{
		Model: apiModel,
		//Temperature: 0.8,
		Messages: []Message{
			{
				Role:    "system",
				Content: "You are an advertisement recognition assistant. I will send you the subtitles of a video, please identify the start and end times of the advertisement in the video.",
			}, {
				Role:    "system",
				Content: "If the result matches, continue to check whether the original content's context before and after is related to the advertisement. If there is a connection, also include the time range of the related content.",
			}, {
				Role:    "system",
				Content: "Please return strictly in this format, do not include extra characters, format: 'ss-ss'",
			}, {
				Role:    "user",
				Content: message,
			},
		},
	}
	requestBody, err := json.Marshal(requestData)
	if err != nil {
		fmt.Println("JSON Serialization failed:", err)
		return ""
	}
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(requestBody))
	if err != nil {
		fmt.Println("Create request failed:", err)
		return ""
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Request send failed.:", err)
		return ""
	}
	defer resp.Body.Close()
	var response ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		fmt.Println("Response parsing failed:", err)
		return ""
	}
	if response.Error.Message != "" {
		fmt.Println("API error:", response.Error.Message)
		return ""
	}
	if len(response.Choices) == 0 {
		fmt.Println("No valid response received")
	}
	return response.Choices[0].Message.Content
}
